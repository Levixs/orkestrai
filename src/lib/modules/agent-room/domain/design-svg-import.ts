import { SVGPathData, type SVGCommand } from 'svg-pathdata';
import type { DesignElement, DesignPaint, DesignPathPoint } from '../contracts/schemas/designSchemas.js';
import { designPathBounds } from './design-geometry.js';

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
type SvgGroupRef = { key: string; name: string; parentKey: string | null; order: number };
type ImportedPath = { name: string; d: string; matrix: Matrix; style: SvgStyle; fillRule: DesignElement['fillRule']; groups: SvgGroupRef[] };
type ImportedText = { element: Element; matrix: Matrix; style: SvgStyle; groups: SvgGroupRef[] };
type SvgStyle = Record<string, string>;

export type SvgImportResult = {
  elements: DesignElement[];
  warnings: string[];
};

export class SvgImportError extends Error {
  constructor(readonly code: 'invalid' | 'empty') {
    super(code);
    this.name = 'SvgImportError';
  }
}

export type SvgImportOptions = {
  name: string;
  centerX: number;
  centerY: number;
  maxWidth: number;
  maxHeight: number;
  createElement: (type: 'group' | 'path' | 'text', x: number, y: number) => DesignElement;
};

const identity: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const supportedNodes = new Set(['svg', 'g', 'a', 'symbol', 'defs', 'style', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'use', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask']);
const inheritedStyleKeys = ['color', 'fill', 'fill-opacity', 'fill-rule', 'font-family', 'font-size', 'font-weight', 'opacity', 'stroke', 'stroke-opacity', 'stroke-width'];

function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function translate(x: number, y: number): Matrix {
  return { ...identity, e: x, f: y };
}

function transformMatrix(value: string | null): Matrix {
  if (!value) return identity;
  let matrix = identity;
  for (const match of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const name = match[1].toLowerCase();
    const values = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let next = identity;
    if (name === 'matrix' && values.length >= 6) next = { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] };
    else if (name === 'translate') next = translate(values[0] || 0, values[1] || 0);
    else if (name === 'scale') next = { a: values[0] ?? 1, b: 0, c: 0, d: values[1] ?? values[0] ?? 1, e: 0, f: 0 };
    else if (name === 'rotate') {
      const radians = (values[0] || 0) * Math.PI / 180;
      const rotation = { a: Math.cos(radians), b: Math.sin(radians), c: -Math.sin(radians), d: Math.cos(radians), e: 0, f: 0 };
      next = values.length >= 3
        ? multiply(translate(values[1], values[2]), multiply(rotation, translate(-values[1], -values[2])))
        : rotation;
    } else if (name === 'skewx') next = { ...identity, c: Math.tan((values[0] || 0) * Math.PI / 180) };
    else if (name === 'skewy') next = { ...identity, b: Math.tan((values[0] || 0) * Math.PI / 180) };
    matrix = multiply(matrix, next);
  }
  return matrix;
}

function point(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
}

function numberAttribute(element: Element, name: string, fallback = 0): number {
  const value = Number.parseFloat(element.getAttribute(name) || '');
  return Number.isFinite(value) ? value : fallback;
}

function normalizedUnitAttribute(element: Element, name: string, fallback: number): number {
  const raw = element.getAttribute(name)?.trim();
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith('%') ? value / 100 : value;
}

function inlineStyle(element: Element): SvgStyle {
  const style: SvgStyle = {};
  for (const declaration of (element.getAttribute('style') || '').split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    style[declaration.slice(0, separator).trim().toLowerCase()] = declaration.slice(separator + 1).trim();
  }
  return style;
}

function stylesheetRules(root: Element): Map<string, SvgStyle> {
  const rules = new Map<string, SvgStyle>();
  for (const styleNode of Array.from(root.querySelectorAll('style'))) {
    const source = (styleNode.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of source.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
      const declarations: SvgStyle = {};
      for (const declaration of match[2].split(';')) {
        const separator = declaration.indexOf(':');
        if (separator < 1) continue;
        declarations[declaration.slice(0, separator).trim().toLowerCase()] = declaration.slice(separator + 1).replace(/!important\s*$/i, '').trim();
      }
      for (const selector of match[1].split(',').map((item) => item.trim()).filter((item) => /^[.#]?[\w-]+$/.test(item))) {
        rules.set(selector, { ...(rules.get(selector) ?? {}), ...declarations });
      }
    }
  }
  return rules;
}

function resolvedStyle(element: Element, parent: SvgStyle, rules: Map<string, SvgStyle>): SvgStyle {
  const style: SvgStyle = {};
  for (const key of inheritedStyleKeys) if (parent[key] !== undefined) style[key] = parent[key];
  const tagRule = rules.get(element.tagName.toLowerCase());
  if (tagRule) Object.assign(style, tagRule);
  const id = element.getAttribute('id');
  if (id && rules.has(`#${id}`)) Object.assign(style, rules.get(`#${id}`));
  for (const className of (element.getAttribute('class') || '').split(/\s+/).filter(Boolean)) {
    if (rules.has(`.${className}`)) Object.assign(style, rules.get(`.${className}`));
  }
  for (const key of inheritedStyleKeys) {
    const value = element.getAttribute(key);
    if (value !== null) style[key] = value;
  }
  return { ...style, ...inlineStyle(element) };
}

function normalizedColor(value: string | undefined, fallback = '#000000'): string | null {
  if (!value || value === 'currentColor') value = fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'none' || normalized === 'transparent') return null;
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3,4}$/i.test(normalized)) return `#${normalized.slice(1).split('').map((part) => part + part).join('')}`;
  const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+%?))?\s*\)$/);
  if (rgb) {
    const hex = [rgb[1], rgb[2], rgb[3]].map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, '0')).join('');
    const alpha = rgb[4] === undefined ? '' : Math.round(Math.max(0, Math.min(1, rgb[4].endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : Number(rgb[4]))) * 255).toString(16).padStart(2, '0');
    return `#${hex}${alpha}`;
  }
  const named: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', yellow: '#ffff00', magenta: '#ff00ff', fuchsia: '#ff00ff', cyan: '#00ffff', aqua: '#00ffff' };
  return named[normalized] ?? fallback;
}

function clampOpacity(value: string | undefined, fallback = 1): number {
  const parsed = Number.parseFloat(value || '');
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function gradientPaint(root: Element, value: string, opacity: number): DesignPaint | null {
  const reference = value.match(/^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/i)?.[1];
  if (!reference) return null;
  const gradient = Array.from(root.querySelectorAll('linearGradient,radialGradient')).find((candidate) => candidate.getAttribute('id') === reference);
  if (!gradient) return null;
  const stops = Array.from(gradient.querySelectorAll('stop')).map((stop) => {
    const style = inlineStyle(stop);
    const offsetValue = stop.getAttribute('offset') || '0';
    const offset = offsetValue.endsWith('%') ? Number.parseFloat(offsetValue) / 100 : Number.parseFloat(offsetValue);
    return {
      offset: Math.max(0, Math.min(1, Number.isFinite(offset) ? offset : 0)),
      color: normalizedColor(style['stop-color'] || stop.getAttribute('stop-color') || '#000000') ?? '#000000',
      opacity: clampOpacity(style['stop-opacity'] || stop.getAttribute('stop-opacity') || undefined),
    };
  }).sort((left, right) => left.offset - right.offset);
  if (stops.length < 2) return null;
  if (gradient.tagName.toLowerCase() === 'radialgradient') {
    return {
      type: 'radial-gradient',
      centerX: normalizedUnitAttribute(gradient, 'cx', 0.5),
      centerY: normalizedUnitAttribute(gradient, 'cy', 0.5),
      radius: Math.max(0.01, normalizedUnitAttribute(gradient, 'r', 0.5)),
      stops,
      opacity,
      visible: true,
    };
  }
  const x1 = normalizedUnitAttribute(gradient, 'x1', 0);
  const y1 = normalizedUnitAttribute(gradient, 'y1', 0);
  const x2 = normalizedUnitAttribute(gradient, 'x2', 1);
  const y2 = normalizedUnitAttribute(gradient, 'y2', 0);
  return { type: 'linear-gradient', angle: Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI, stops, opacity, visible: true };
}

function paint(root: Element, value: string | undefined, opacity: number, color: string): DesignPaint[] {
  if (!value || value === 'none' || value === 'transparent') return [];
  const gradient = gradientPaint(root, value, opacity);
  if (gradient) return [gradient];
  const solid = normalizedColor(value, color);
  return solid ? [{ type: 'solid', color: solid, opacity, visible: true }] : [];
}

function rectPath(element: Element): string {
  const x = numberAttribute(element, 'x');
  const y = numberAttribute(element, 'y');
  const width = Math.max(0, numberAttribute(element, 'width'));
  const height = Math.max(0, numberAttribute(element, 'height'));
  const radius = Math.max(0, Math.min(width / 2, height / 2, numberAttribute(element, 'rx', numberAttribute(element, 'ry'))));
  if (!radius) return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
  return `M${x + radius} ${y}H${x + width - radius}A${radius} ${radius} 0 0 1 ${x + width} ${y + radius}V${y + height - radius}A${radius} ${radius} 0 0 1 ${x + width - radius} ${y + height}H${x + radius}A${radius} ${radius} 0 0 1 ${x} ${y + height - radius}V${y + radius}A${radius} ${radius} 0 0 1 ${x + radius} ${y}Z`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}

function geometryPath(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  if (tag === 'path') return element.getAttribute('d');
  if (tag === 'rect') return rectPath(element);
  if (tag === 'circle') return ellipsePath(numberAttribute(element, 'cx'), numberAttribute(element, 'cy'), numberAttribute(element, 'r'), numberAttribute(element, 'r'));
  if (tag === 'ellipse') return ellipsePath(numberAttribute(element, 'cx'), numberAttribute(element, 'cy'), numberAttribute(element, 'rx'), numberAttribute(element, 'ry'));
  if (tag === 'line') return `M${numberAttribute(element, 'x1')} ${numberAttribute(element, 'y1')}L${numberAttribute(element, 'x2')} ${numberAttribute(element, 'y2')}`;
  if (tag === 'polyline' || tag === 'polygon') {
    const points = (element.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    if (points.length < 4) return null;
    return `${points.reduce((value, coordinate, index) => index % 2 ? `${value} ${coordinate}` : `${value}${index ? 'L' : 'M'}${coordinate}`, '')}${tag === 'polygon' ? 'Z' : ''}`;
  }
  return null;
}

function commandSubpaths(commands: SVGCommand[]): Array<{ points: DesignPathPoint[]; closed: boolean }> {
  const subpaths: Array<{ points: DesignPathPoint[]; closed: boolean }> = [];
  let current: DesignPathPoint[] = [];
  const finish = (closed = false) => {
    if (current.length >= 2) {
      const first = current[0];
      const last = current.at(-1)!;
      const inferredClosed = closed || (current.length > 2 && Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001);
      if (inferredClosed && current.length > 2 && Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) current.pop();
      subpaths.push({ points: current, closed: inferredClosed });
    }
    current = [];
  };
  for (const command of commands) {
    if (command.type === SVGPathData.MOVE_TO) {
      finish();
      current = [{ x: command.x, y: command.y, inX: null, inY: null, outX: null, outY: null, mode: 'corner' }];
    } else if (command.type === SVGPathData.LINE_TO) {
      current.push({ x: command.x, y: command.y, inX: null, inY: null, outX: null, outY: null, mode: 'corner' });
    } else if (command.type === SVGPathData.CURVE_TO) {
      const previous = current.at(-1);
      if (!previous) continue;
      previous.outX = command.x1;
      previous.outY = command.y1;
      previous.mode = 'disconnected';
      current.push({ x: command.x, y: command.y, inX: command.x2, inY: command.y2, outX: null, outY: null, mode: 'disconnected' });
    } else if (command.type === SVGPathData.CLOSE_PATH) finish(true);
  }
  finish();
  return subpaths;
}

function normalizeSubpaths(subpaths: DesignPathPoint[][], closed: boolean): { x: number; y: number; width: number; height: number; subpaths: DesignPathPoint[][] } | null {
  const bounds = designPathBounds(subpaths, closed);
  if (!bounds) return null;
  return {
    ...bounds,
    subpaths: subpaths.map((path) => path.map((pathPoint) => ({
      ...pathPoint,
      x: pathPoint.x - bounds.x,
      y: pathPoint.y - bounds.y,
      inX: pathPoint.inX === null ? null : pathPoint.inX - bounds.x,
      inY: pathPoint.inY === null ? null : pathPoint.inY - bounds.y,
      outX: pathPoint.outX === null ? null : pathPoint.outX - bounds.x,
      outY: pathPoint.outY === null ? null : pathPoint.outY - bounds.y,
    }))),
  };
}

export function parseSvgPathData(path: string): {
  x: number;
  y: number;
  width: number;
  height: number;
  subpaths: DesignPathPoint[][];
  closed: boolean;
} | null {
  try {
    const commands = new SVGPathData(path).toAbs().normalizeHVZ().normalizeST().qtToC().aToC().sanitize().commands;
    const parsed = commandSubpaths(commands);
    if (!parsed.length) return null;
    const closed = parsed.every((subpath) => subpath.closed);
    const normalized = normalizeSubpaths(parsed.map((subpath) => subpath.points), closed);
    return normalized ? { ...normalized, closed } : null;
  } catch {
    return null;
  }
}

function label(element: Element, fallback: string): string {
  return element.getAttribute('aria-label') || element.getAttribute('data-name') || element.getAttribute('id') || element.querySelector(':scope > title')?.textContent?.trim() || fallback;
}

function elementOpacity(style: SvgStyle): number {
  return clampOpacity(style.opacity, 1);
}

export function importSvgToDesign(svg: string, options: SvgImportOptions): SvgImportResult {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const parserError = parsed.querySelector('parsererror');
  const root = parsed.documentElement;
  if (parserError || root.tagName.toLowerCase() !== 'svg') throw new SvgImportError('invalid');
  const rules = stylesheetRules(root);
  const paths: ImportedPath[] = [];
  const texts: ImportedText[] = [];
  const warnings = new Set<string>();
  const sourceGroups: SvgGroupRef[] = [];
  let shapeIndex = 0;
  let groupIndex = 0;

  for (const unsupported of Array.from(root.querySelectorAll('clipPath,mask,filter,pattern,marker,foreignObject,image'))) {
    warnings.add(unsupported.tagName.toLowerCase());
  }

  const visit = (element: Element, parentMatrix: Matrix, parentStyle: SvgStyle, visitedUses = new Set<Element>(), parentGroups: SvgGroupRef[] = []) => {
    const tag = element.tagName.toLowerCase();
    if (!supportedNodes.has(tag)) warnings.add(tag);
    if (tag === 'defs' || tag === 'style' || tag === 'title' || tag === 'desc' || tag === 'lineargradient' || tag === 'radialgradient' || tag === 'stop' || tag === 'clippath' || tag === 'mask') return;
    const style = resolvedStyle(element, parentStyle, rules);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const matrix = multiply(parentMatrix, transformMatrix(element.getAttribute('transform')));
    const groups = tag === 'g'
      ? [...parentGroups, (() => {
          groupIndex += 1;
          const group = {
            key: `svg-group-${groupIndex}`,
            name: label(element, `${options.name} group ${groupIndex}`),
            parentKey: parentGroups.at(-1)?.key ?? null,
            order: groupIndex,
          };
          sourceGroups.push(group);
          return group;
        })()]
      : parentGroups;
    if (tag === 'use') {
      const href = element.getAttribute('href') || element.getAttribute('xlink:href');
      const referenced = href?.startsWith('#') ? parsed.getElementById(href.slice(1)) : null;
      if (referenced && !visitedUses.has(referenced)) visit(referenced, multiply(matrix, translate(numberAttribute(element, 'x'), numberAttribute(element, 'y'))), style, new Set([...visitedUses, referenced]), groups);
      else warnings.add('use');
      return;
    }
    const d = geometryPath(element);
    if (d) {
      shapeIndex += 1;
      paths.push({ name: label(element, `${options.name} ${shapeIndex}`), d, matrix, style, fillRule: (style['fill-rule'] || element.getAttribute('fill-rule')) === 'evenodd' ? 'evenodd' : 'nonzero', groups });
    } else if (tag === 'text' && (element.textContent || '').trim()) texts.push({ element, matrix, style, groups });
    for (const child of Array.from(element.children)) visit(child, matrix, style, visitedUses, groups);
  };

  visit(root, identity, { fill: '#000000', stroke: 'none', color: '#000000' });
  const elements: DesignElement[] = [];
  const elementGroups = new Map<string, SvgGroupRef[]>();
  let order = 0;
  for (const imported of paths) {
    let commands: SVGCommand[];
    try {
      commands = new SVGPathData(imported.d).toAbs().normalizeHVZ().normalizeST().qtToC().aToC().matrix(imported.matrix.a, imported.matrix.b, imported.matrix.c, imported.matrix.d, imported.matrix.e, imported.matrix.f).sanitize().commands;
    } catch {
      warnings.add('path');
      continue;
    }
    const byClosed = new Map<boolean, DesignPathPoint[][]>();
    for (const subpath of commandSubpaths(commands)) byClosed.set(subpath.closed, [...(byClosed.get(subpath.closed) ?? []), subpath.points]);
    for (const [closed, subpaths] of byClosed) {
      const normalized = normalizeSubpaths(subpaths, closed);
      if (!normalized) continue;
      const base = options.createElement('path', normalized.x, normalized.y);
      const color = normalizedColor(imported.style.color, '#000000') ?? '#000000';
      const fillOpacity = clampOpacity(imported.style['fill-opacity']);
      const strokeOpacity = clampOpacity(imported.style['stroke-opacity']);
      const fills = paint(root, imported.style.fill, fillOpacity, color);
      const strokes = paint(root, imported.style.stroke, strokeOpacity, color);
      const created = {
        ...base,
        name: imported.name,
        x: normalized.x,
        y: normalized.y,
        width: normalized.width,
        height: normalized.height,
        opacity: elementOpacity(imported.style),
        fill: 'transparent',
        stroke: 'transparent',
        fills,
        strokes,
        strokeWidth: strokes.length ? Math.max(0, Number.parseFloat(imported.style['stroke-width'] || '1') || 1) : 0,
        pathPoints: normalized.subpaths.length === 1 ? normalized.subpaths[0] : [],
        pathSubpaths: normalized.subpaths.length > 1 ? normalized.subpaths : [],
        pathClosed: closed,
        fillRule: imported.fillRule,
        order: order++,
      } satisfies DesignElement;
      elements.push(created);
      elementGroups.set(created.id, imported.groups);
    }
  }

  for (const imported of texts) {
    const sourceX = numberAttribute(imported.element, 'x');
    const sourceY = numberAttribute(imported.element, 'y');
    const origin = point(imported.matrix, sourceX, sourceY);
    const fontSize = Math.max(4, Number.parseFloat(imported.style['font-size'] || imported.element.getAttribute('font-size') || '16') || 16);
    const text = (imported.element.textContent || '').replace(/\s+/g, ' ').trim();
    const base = options.createElement('text', origin.x, origin.y - fontSize);
    const color = normalizedColor(imported.style.color, '#000000') ?? '#000000';
    const fills = paint(root, imported.style.fill || color, clampOpacity(imported.style['fill-opacity']), color);
    const created = {
      ...base,
      name: label(imported.element, text.slice(0, 40) || options.name),
      x: origin.x,
      y: origin.y - fontSize,
      width: Math.max(fontSize, text.length * fontSize * 0.6),
      height: fontSize * 1.25,
      text,
      fontSize,
      fontWeight: Math.max(100, Math.min(900, Number.parseInt(imported.style['font-weight'] || '400', 10) || 400)),
      fill: 'transparent',
      fills,
      opacity: elementOpacity(imported.style),
      order: order++,
    } satisfies DesignElement;
    elements.push(created);
    elementGroups.set(created.id, imported.groups);
  }

  if (!elements.length) throw new SvgImportError('empty');
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const bottom = Math.max(...elements.map((element) => element.y + element.height));
  const sourceWidth = Math.max(1, right - left);
  const sourceHeight = Math.max(1, bottom - top);
  const scale = Math.min(1, options.maxWidth / sourceWidth, options.maxHeight / sourceHeight);
  const targetLeft = options.centerX - sourceWidth * scale / 2;
  const targetTop = options.centerY - sourceHeight * scale / 2;
  const scaled = elements.map((element) => ({
    ...element,
    x: targetLeft + (element.x - left) * scale,
    y: targetTop + (element.y - top) * scale,
    width: Math.max(1, element.width * scale),
    height: Math.max(1, element.height * scale),
    strokeWidth: element.strokeWidth * scale,
    fontSize: element.fontSize * scale,
    pathPoints: element.pathPoints.map((pathPoint) => ({
      ...pathPoint,
      x: pathPoint.x * scale,
      y: pathPoint.y * scale,
      inX: pathPoint.inX === null ? null : pathPoint.inX * scale,
      inY: pathPoint.inY === null ? null : pathPoint.inY * scale,
      outX: pathPoint.outX === null ? null : pathPoint.outX * scale,
      outY: pathPoint.outY === null ? null : pathPoint.outY * scale,
    })),
    pathSubpaths: element.pathSubpaths.map((subpath) => subpath.map((pathPoint) => ({
      ...pathPoint,
      x: pathPoint.x * scale,
      y: pathPoint.y * scale,
      inX: pathPoint.inX === null ? null : pathPoint.inX * scale,
      inY: pathPoint.inY === null ? null : pathPoint.inY * scale,
      outX: pathPoint.outX === null ? null : pathPoint.outX * scale,
      outY: pathPoint.outY === null ? null : pathPoint.outY * scale,
    }))),
  }));

  const usedGroupKeys = new Set(scaled.flatMap((element) => (elementGroups.get(element.id) ?? []).map((group) => group.key)));
  const usedGroups = sourceGroups.filter((group) => usedGroupKeys.has(group.key));
  if (scaled.length === 1 && !usedGroups.length) return { elements: scaled, warnings: [...warnings] };
  const group = options.createElement('group', targetLeft, targetTop);
  const groupId = group.id;
  const nativeGroups = new Map<string, DesignElement>();
  const nestedGroups = usedGroups.map((sourceGroup) => {
    const descendants = scaled.filter((element) => (elementGroups.get(element.id) ?? []).some((candidate) => candidate.key === sourceGroup.key));
    const left = Math.min(...descendants.map((element) => element.x));
    const top = Math.min(...descendants.map((element) => element.y));
    const right = Math.max(...descendants.map((element) => element.x + element.width));
    const bottom = Math.max(...descendants.map((element) => element.y + element.height));
    const base = options.createElement('group', left, top);
    const native = {
      ...base,
      name: sourceGroup.name,
      parentId: sourceGroup.parentKey ? nativeGroups.get(sourceGroup.parentKey)?.id ?? groupId : groupId,
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      fill: 'transparent',
      stroke: 'transparent',
      fills: [],
      strokes: [],
      strokeWidth: 0,
      order: Math.min(...descendants.map((element) => element.order)),
    } satisfies DesignElement;
    nativeGroups.set(sourceGroup.key, native);
    return native;
  });
  return {
    elements: [
      { ...group, name: options.name, x: targetLeft, y: targetTop, width: sourceWidth * scale, height: sourceHeight * scale, fill: 'transparent', stroke: 'transparent', fills: [], strokes: [], strokeWidth: 0, order: Math.min(...scaled.map((element) => element.order)) },
      ...nestedGroups,
      ...scaled.map((element) => {
        const deepest = elementGroups.get(element.id)?.at(-1);
        return { ...element, parentId: deepest ? nativeGroups.get(deepest.key)?.id ?? groupId : groupId, order: element.order + 1 };
      }),
    ],
    warnings: [...warnings],
  };
}
