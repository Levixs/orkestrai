import type { DesignDocument, DesignElement } from '../contracts/schemas/designSchemas.js';
import { designTextHeight } from './design-geometry.js';

export type DesignQualitySeverity = 'error' | 'warning' | 'info';
export type DesignQualityRule = 'naming' | 'text-clipping' | 'content-clipping' | 'overlap' | 'contrast' | 'accessibility';

export type DesignQualityIssue = {
  id: string;
  rule: DesignQualityRule;
  severity: DesignQualitySeverity;
  elementId: string;
  relatedElementId: string | null;
  data: Record<string, string | number>;
};

export type DesignQualityReport = {
  revision: number;
  auditedElements: number;
  durationMs: number;
  issues: DesignQualityIssue[];
  counts: Record<DesignQualitySeverity, number>;
};

type Rect = Pick<DesignElement, 'x' | 'y' | 'width' | 'height'>;

function solidColor(element: DesignElement): string | null {
  const paint = element.fills.find((candidate) => candidate.visible && candidate.type === 'solid');
  const color = paint?.type === 'solid' ? paint.color : element.fill;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function rgb(color: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255) as [number, number, number];
}

function luminance(color: string): number {
  return rgb(color).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

export function designContrastRatio(foreground: string, background: string): number {
  const [bright, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (bright + 0.05) / (dark + 0.05);
}

function intersectionArea(first: Rect, second: Rect): number {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return width * height;
}

function outside(child: Rect, parent: Rect): boolean {
  return child.x < parent.x || child.y < parent.y
    || child.x + child.width > parent.x + parent.width
    || child.y + child.height > parent.y + parent.height;
}

function issue(rule: DesignQualityRule, severity: DesignQualitySeverity, elementId: string, data: Record<string, string | number> = {}, relatedElementId: string | null = null): DesignQualityIssue {
  return { id: `${rule}:${elementId}:${relatedElementId ?? ''}`, rule, severity, elementId, relatedElementId, data };
}

function backgroundFor(document: DesignDocument, element: DesignElement, elements: Map<string, DesignElement>): string | null {
  let parentId = element.parentId;
  while (parentId) {
    const parent = elements.get(parentId);
    if (!parent) break;
    const color = solidColor(parent);
    if (color) return color;
    parentId = parent.parentId;
  }
  const page = document.pages.find((candidate) => candidate.id === element.pageId);
  return page && /^#[0-9a-f]{6}$/i.test(page.background) ? page.background : null;
}

export function auditDesignDocument(document: DesignDocument): DesignQualityReport {
  const started = performance.now();
  const issues: DesignQualityIssue[] = [];
  const visible = document.elements.filter((element) => element.visible && element.opacity > 0);
  const elementMap = new Map(document.elements.map((element) => [element.id, element]));
  const names = new Map<string, DesignElement[]>();

  for (const element of visible) {
    const normalizedName = element.name.trim().toLocaleLowerCase();
    const named = names.get(`${element.pageId}:${normalizedName}`) ?? [];
    named.push(element);
    names.set(`${element.pageId}:${normalizedName}`, named);

    if (/^(untitled|layer|frame|group|rectangle|ellipse|text|path|image)(\s+\d+)?$/i.test(element.name.trim())) {
      issues.push(issue('naming', 'info', element.id, { name: element.name }));
    }

    if (element.type === 'text' && element.text.trim()) {
      const requiredHeight = designTextHeight(element.text, element.width, element.fontSize, element.fontWeight);
      if (requiredHeight > element.height + 2) {
        issues.push(issue('text-clipping', 'error', element.id, { requiredHeight: Math.ceil(requiredHeight), height: Math.round(element.height) }));
      }
      const foreground = solidColor(element);
      const background = backgroundFor(document, element, elementMap);
      if (foreground && background) {
        const ratio = designContrastRatio(foreground, background);
        const threshold = element.fontSize >= 24 || (element.fontSize >= 18.66 && element.fontWeight >= 700) ? 3 : 4.5;
        if (ratio < threshold) issues.push(issue('contrast', 'error', element.id, { ratio: Number(ratio.toFixed(2)), threshold }));
      }
    }

    const parent = element.parentId ? elementMap.get(element.parentId) : null;
    if (parent?.clipContent && outside(element, parent)) {
      issues.push(issue('content-clipping', 'warning', element.id, { parent: parent.name }, parent.id));
    }

    const needsLabel = element.type === 'image' || ['button', 'link', 'input', 'navigation', 'region'].includes(element.accessibilityRole);
    if (!element.decorative && needsLabel && !element.accessibilityLabel && !(element.type === 'text' && element.text.trim())) {
      issues.push(issue('accessibility', 'error', element.id, { role: element.accessibilityRole === 'none' ? element.type : element.accessibilityRole }));
    }
    if (element.decorative && element.accessibilityRole !== 'none') {
      issues.push(issue('accessibility', 'warning', element.id, { role: element.accessibilityRole }));
    }
  }

  for (const duplicates of names.values()) {
    if (duplicates.length < 2) continue;
    for (const duplicate of duplicates) issues.push(issue('naming', 'warning', duplicate.id, { name: duplicate.name, count: duplicates.length }));
  }

  const siblings = new Map<string, DesignElement[]>();
  for (const element of visible) {
    if (element.type === 'frame' || element.type === 'group' || element.isMask) continue;
    const key = `${element.pageId}:${element.parentId ?? 'root'}:${element.type}`;
    const list = siblings.get(key) ?? [];
    list.push(element);
    siblings.set(key, list);
  }
  // Spatial buckets keep the audit interactive for large documents. A pair
  // may occupy several buckets, so it is checked once through `visitedPairs`.
  const cellSize = 128;
  const visitedPairs = new Set<string>();
  const maxOverlapIssues = 500;
  let overlapIssues = 0;
  for (const list of siblings.values()) {
    const buckets = new Map<string, DesignElement[]>();
    for (const element of list) {
      const minX = Math.floor(element.x / cellSize);
      const maxX = Math.floor((element.x + Math.max(1, element.width)) / cellSize);
      const minY = Math.floor(element.y / cellSize);
      const maxY = Math.floor((element.y + Math.max(1, element.height)) / cellSize);
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          const key = `${x}:${y}`;
          const bucket = buckets.get(key) ?? [];
          bucket.push(element);
          buckets.set(key, bucket);
        }
      }
    }
    for (const bucket of buckets.values()) {
      if (overlapIssues >= maxOverlapIssues) break;
      for (let firstIndex = 0; firstIndex < bucket.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < bucket.length; secondIndex += 1) {
          const first = bucket[firstIndex];
          const second = bucket[secondIndex];
          const pairKey = first.id < second.id ? `${first.id}:${second.id}` : `${second.id}:${first.id}`;
          if (visitedPairs.has(pairKey)) continue;
          visitedPairs.add(pairKey);
          const overlap = intersectionArea(first, second);
          const smaller = Math.min(first.width * first.height, second.width * second.height);
          if (smaller > 0 && overlap / smaller >= 0.5) {
            issues.push(issue('overlap', 'warning', first.id, { percent: Math.round(overlap / smaller * 100), relatedName: second.name }, second.id));
            overlapIssues += 1;
            if (overlapIssues >= maxOverlapIssues) break;
          }
        }
        if (overlapIssues >= maxOverlapIssues) break;
      }
    }
  }

  const counts = { error: 0, warning: 0, info: 0 } satisfies Record<DesignQualitySeverity, number>;
  for (const candidate of issues) counts[candidate.severity] += 1;
  return {
    revision: document.revision,
    auditedElements: visible.length,
    durationMs: Number((performance.now() - started).toFixed(2)),
    issues,
    counts,
  };
}
