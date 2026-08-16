<script lang="ts">
  import { onMount } from 'svelte';
  import { getCsrfToken } from '@beeblock/svelar/http';
  import { toast } from '@beeblock/svelar/ui';
  import {
    AlignCenter,
    AlignHorizontalDistributeCenter,
    AlignHorizontalJustifyCenter,
    AlignHorizontalJustifyEnd,
    AlignHorizontalJustifyStart,
    AlignLeft,
    AlignRight,
    AlignVerticalDistributeCenter,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    AlignVerticalJustifyStart,
    ArrowDown,
    ArrowUp,
    Blend,
    ChevronDown,
    Circle,
    Combine,
    Download,
    Eye,
    EyeOff,
    Frame,
    ImagePlus,
    Lock,
    Magnet,
    Maximize2,
    MousePointer2,
    PenTool,
    Plus,
    Redo2,
    RectangleHorizontal,
    Ruler,
    Sparkles,
    Trash2,
    Type,
    Undo2,
    Unlock,
    ZoomIn,
    ZoomOut,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as NativeSelect from '$lib/components/ui/native-select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import {
    designElementSchema,
    type DesignAsset,
    type DesignDocument,
    type DesignEffect,
    type DesignElement,
    type DesignOperation,
    type DesignPaint,
    type DesignPathPoint,
  } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
  import {
    autoLayoutChanges,
    combineDesignElements,
    constrainedChildChanges,
    type DesignBooleanOperation,
  } from '$lib/modules/agent-room/domain/design-geometry.js';
  import * as m from '$lib/paraglide/messages.js';
  import DesignPaintEditor from './DesignPaintEditor.svelte';
  import DesignRenderer from './DesignRenderer.svelte';

  let {
    workspaceId,
    nodeId,
    externalRevision = 0,
    class: className = '',
  }: {
    workspaceId: string;
    nodeId: string;
    externalRevision?: number;
    class?: string;
  } = $props();

  type Tool = 'select' | 'frame' | 'rectangle' | 'ellipse' | 'text' | 'path';
  type ShapeTool = Exclude<Tool, 'select' | 'path'>;
  type HistoryEntry = { forward: DesignOperation[]; inverse: DesignOperation[]; summary: string };
  type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'distribute-x' | 'distribute-y';

  let document = $state<DesignDocument | null>(null);
  let selectedIds = $state<string[]>([]);
  let tool = $state<Tool>('select');
  let loading = $state(true);
  let saving = $state(false);
  let errorMessage = $state('');
  let zoom = $state(0.65);
  let viewport = $state<HTMLElement>();
  let editorRoot = $state<HTMLElement>();
  let pageSvg = $state<SVGSVGElement>();
  let assetInput = $state<HTMLInputElement>();
  let undoStack = $state<HistoryEntry[]>([]);
  let redoStack = $state<HistoryEntry[]>([]);
  let draftElement = $state<DesignElement | null>(null);
  let cancelDrawing: (() => void) | null = null;
  let penPoints = $state<Array<{ x: number; y: number }>>([]);
  let snapEnabled = $state(true);
  let rulersVisible = $state(true);
  let snapLinesX = $state<number[]>([]);
  let snapLinesY = $state<number[]>([]);
  let exporting = $state(false);
  let thumbnailRevision = $state(-1);
  let thumbnailTimer: ReturnType<typeof setTimeout> | null = null;

  const page = $derived(document?.pages.find((item) => item.id === document?.activePageId) ?? document?.pages[0] ?? null);
  const pageElements = $derived(document && page ? document.elements.filter((element) => element.pageId === page.id) : []);
  const renderedElements = $derived(draftElement ? [...pageElements, draftElement] : pageElements);
  const selectedElements = $derived(pageElements.filter((element) => selectedIds.includes(element.id)));
  const selected = $derived(selectedElements.length === 1 ? selectedElements[0] : null);
  const rulerXTicks = $derived(page ? Array.from({ length: Math.ceil(page.width / 100) + 1 }, (_, index) => index * 100) : []);
  const rulerYTicks = $derived(page ? Array.from({ length: Math.ceil(page.height / 100) + 1 }, (_, index) => index * 100) : []);

  function uuidv7(): string {
    const timestamp = Date.now().toString(16).padStart(12, '0');
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const variant = ((Number.parseInt(random[3], 16) & 0x3) | 0x8).toString(16);
    return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${random.slice(0, 3)}-${variant}${random.slice(4, 7)}-${random.slice(7, 19)}`;
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const csrf = getCsrfToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      const error = new Error(payload.error || m['design.error_save']()) as Error & { status?: number; data?: DesignDocument };
      error.status = response.status;
      error.data = payload.data;
      throw error;
    }
    return payload.data as T;
  }

  async function load(silent = false) {
    if (!silent) loading = true;
    errorMessage = '';
    try {
      const latest = await api<DesignDocument>(`/api/agent-room/workspaces/${workspaceId}/designs/${nodeId}`);
      if (!document || latest.revision > document.revision) {
        document = latest;
        selectedIds = selectedIds.filter((id) => document?.elements.some((element) => element.id === id));
        if (silent) {
          undoStack = [];
          redoStack = [];
        }
      }
    } catch (error) {
      if (!silent) errorMessage = error instanceof Error ? error.message : m['design.error_load']();
    } finally {
      if (!silent) loading = false;
    }
  }

  async function apply(
    operations: DesignOperation[],
    summary: string,
    options: { inverse?: DesignOperation[]; record?: boolean } = {},
  ): Promise<boolean> {
    if (!document || saving || !operations.length) return false;
    saving = true;
    try {
      document = await api<DesignDocument>(`/api/agent-room/workspaces/${workspaceId}/designs/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          baseRevision: document.revision,
          operations,
          summary,
          actor: { kind: 'user', id: null, name: null, taskId: null },
        }),
      });
      if (options.record !== false && options.inverse) {
        undoStack = [...undoStack.slice(-99), { forward: operations, inverse: options.inverse, summary }];
        redoStack = [];
      }
      return true;
    } catch (error) {
      const candidate = error as Error & { status?: number; data?: DesignDocument };
      if (candidate.status === 409 && candidate.data) {
        document = candidate.data;
        selectedIds = selectedIds.filter((id) => document?.elements.some((element) => element.id === id));
        undoStack = [];
        redoStack = [];
        toast.error(m['design.conflict']());
      } else {
        toast.error(candidate.message || m['design.error_save']());
      }
      return false;
    } finally {
      saving = false;
    }
  }

  function toolLabel(value: Tool): string {
    if (value === 'frame') return m['design.frame']();
    if (value === 'rectangle') return m['design.rectangle']();
    if (value === 'ellipse') return m['design.ellipse']();
    if (value === 'text') return m['design.text']();
    if (value === 'path') return m['design.pen']();
    return m['design.select']();
  }

  function elementDefaults(kind: Exclude<Tool, 'select'> | 'image', x: number, y: number): DesignElement {
    const count = document?.elements.filter((element) => element.type === kind).length ?? 0;
    return designElementSchema.parse({
      id: uuidv7(),
      pageId: page!.id,
      parentId: null,
      type: kind,
      name: `${kind === 'image' ? m['design.image']() : toolLabel(kind)} ${count + 1}`,
      x,
      y,
      width: kind === 'frame' ? 390 : kind === 'text' ? 240 : kind === 'image' ? 320 : 180,
      height: kind === 'frame' ? 844 : kind === 'text' ? 48 : kind === 'image' ? 240 : 120,
      fill: kind === 'frame' ? '#ffffff' : kind === 'text' ? '#191919' : kind === 'path' || kind === 'image' ? 'transparent' : '#7c5cff',
      stroke: kind === 'frame' ? '#d4d4d0' : kind === 'path' ? '#7c5cff' : 'transparent',
      strokeWidth: kind === 'frame' || kind === 'path' ? 1 : 0,
      cornerRadius: kind === 'ellipse' || kind === 'path' ? 0 : 8,
      text: kind === 'text' ? m['design.text']() : '',
      fontSize: kind === 'text' ? 32 : 16,
      fontWeight: kind === 'text' ? 600 : 400,
      order: Math.max(-1, ...pageElements.map((element) => element.order)) + 1,
    });
  }

  function pagePoint(event: PointerEvent, svg = pageSvg): { x: number; y: number } {
    if (!svg || !page) return { x: 0, y: 0 };
    const bounds = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(page.width, Math.round((event.clientX - bounds.left) * page.width / bounds.width))),
      y: Math.max(0, Math.min(page.height, Math.round((event.clientY - bounds.top) * page.height / bounds.height))),
    };
  }

  function startCreate(event: PointerEvent, kind: ShapeTool, svg: SVGSVGElement) {
    if (!page || event.button !== 0 || saving) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDrawing?.();
    const start = pagePoint(event, svg);
    const pointerId = event.pointerId;
    const initial = { ...elementDefaults(kind, start.x, start.y), width: 1, height: 1 };
    let dragged = false;
    draftElement = initial;
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      cancelDrawing = null;
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const current = pagePoint(moveEvent, svg);
      if (Math.hypot(moveEvent.clientX - event.clientX, moveEvent.clientY - event.clientY) >= 4) dragged = true;
      draftElement = {
        ...initial,
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.max(1, Math.abs(current.x - start.x)),
        height: Math.max(1, Math.abs(current.y - start.y)),
      };
    };
    const finish = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
      const element = dragged && draftElement ? { ...draftElement } : elementDefaults(kind, start.x, start.y);
      draftElement = null;
      void apply([{ kind: 'create', element }], m['design.operation_create']({ type: toolLabel(kind) }), {
        inverse: [{ kind: 'delete', elementId: element.id }],
      }).then((created) => {
        if (!created) return;
        selectedIds = [element.id];
        tool = 'select';
      });
    };
    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      cleanup();
      draftElement = null;
    };
    cancelDrawing = () => {
      cleanup();
      draftElement = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
  }

  function draftPath(points: Array<{ x: number; y: number }>): DesignElement | null {
    if (!page || !points.length) return null;
    const x = Math.min(...points.map((point) => point.x));
    const y = Math.min(...points.map((point) => point.y));
    const width = Math.max(1, Math.max(...points.map((point) => point.x)) - x);
    const height = Math.max(1, Math.max(...points.map((point) => point.y)) - y);
    return designElementSchema.parse({
      ...elementDefaults('path', x, y),
      width,
      height,
      pathPoints: points.map((point) => ({ x: point.x - x, y: point.y - y })),
      pathClosed: false,
    });
  }

  function addPenPoint(event: PointerEvent) {
    if (event.detail >= 2 && penPoints.length >= 2) {
      void finishPath();
      return;
    }
    penPoints = [...penPoints, pagePoint(event)];
    draftElement = draftPath(penPoints);
  }

  async function finishPath() {
    const element = draftPath(penPoints);
    if (!element || penPoints.length < 2) return;
    draftElement = null;
    penPoints = [];
    if (await apply([{ kind: 'create', element }], m['design.operation_create']({ type: m['design.pen']() }), {
      inverse: [{ kind: 'delete', elementId: element.id }],
    })) {
      selectedIds = [element.id];
      tool = 'select';
    }
  }

  function selectForPointer(element: DesignElement, event: PointerEvent): string[] {
    if (event.shiftKey) {
      selectedIds = selectedIds.includes(element.id)
        ? selectedIds.filter((id) => id !== element.id)
        : [...selectedIds, element.id];
      return selectedIds;
    }
    if (!selectedIds.includes(element.id)) selectedIds = [element.id];
    return selectedIds;
  }

  function canvasPointerDown(event: PointerEvent) {
    if (!page || event.button !== 0) return;
    const guideTarget = (event.target as SVGElement).closest<SVGLineElement>('[data-design-guide]');
    if (guideTarget) {
      startGuideDrag(event, guideTarget.dataset.designGuide!);
      return;
    }
    if (tool === 'path') {
      event.preventDefault();
      addPenPoint(event);
      return;
    }
    if (tool === 'select') {
      const target = (event.target as SVGElement).closest<SVGGElement>('[data-design-element]');
      const element = target ? pageElements.find((item) => item.id === target.dataset.designElement) : null;
      if (!element) {
        if (!event.shiftKey) selectedIds = [];
        return;
      }
      const dragIds = selectForPointer(element, event);
      if (!event.shiftKey && dragIds.includes(element.id)) startDrag(event, dragIds);
      return;
    }
    startCreate(event, tool, event.currentTarget as SVGSVGElement);
  }

  function snappedPosition(element: DesignElement, x: number, y: number, excluded: Set<string>) {
    if (!snapEnabled) return { x, y, linesX: [] as number[], linesY: [] as number[] };
    const threshold = Math.max(2, 7 / zoom);
    const xAnchors = [0, element.width / 2, element.width];
    const yAnchors = [0, element.height / 2, element.height];
    const targetX = document?.guides.filter((guide) => guide.axis === 'x').map((guide) => guide.position) ?? [];
    const targetY = document?.guides.filter((guide) => guide.axis === 'y').map((guide) => guide.position) ?? [];
    for (const other of pageElements) {
      if (excluded.has(other.id) || !other.visible) continue;
      targetX.push(other.x, other.x + other.width / 2, other.x + other.width);
      targetY.push(other.y, other.y + other.height / 2, other.y + other.height);
    }
    let bestX = { difference: threshold + 1, value: x, line: null as number | null };
    let bestY = { difference: threshold + 1, value: y, line: null as number | null };
    for (const anchor of xAnchors) for (const target of targetX) {
      const difference = Math.abs(x + anchor - target);
      if (difference < bestX.difference) bestX = { difference, value: target - anchor, line: target };
    }
    for (const anchor of yAnchors) for (const target of targetY) {
      const difference = Math.abs(y + anchor - target);
      if (difference < bestY.difference) bestY = { difference, value: target - anchor, line: target };
    }
    return {
      x: bestX.difference <= threshold ? bestX.value : x,
      y: bestY.difference <= threshold ? bestY.value : y,
      linesX: bestX.difference <= threshold && bestX.line !== null ? [bestX.line] : [],
      linesY: bestY.difference <= threshold && bestY.line !== null ? [bestY.line] : [],
    };
  }

  function startDrag(event: PointerEvent, ids: string[]) {
    if (!document || tool !== 'select') return;
    const moving = document.elements.filter((element) => ids.includes(element.id) && !element.locked);
    if (!moving.length) return;
    event.preventDefault();
    const start = new Map(moving.map((element) => [element.id, { x: element.x, y: element.y }]));
    const anchor = moving[0];
    const excluded = new Set(moving.map((element) => element.id));
    const origin = { clientX: event.clientX, clientY: event.clientY };
    const move = (moveEvent: PointerEvent) => {
      if (!document) return;
      const deltaX = (moveEvent.clientX - origin.clientX) / zoom;
      const deltaY = (moveEvent.clientY - origin.clientY) / zoom;
      const snapped = snappedPosition(anchor, Math.round(start.get(anchor.id)!.x + deltaX), Math.round(start.get(anchor.id)!.y + deltaY), excluded);
      const snappedDeltaX = snapped.x - start.get(anchor.id)!.x;
      const snappedDeltaY = snapped.y - start.get(anchor.id)!.y;
      snapLinesX = snapped.linesX;
      snapLinesY = snapped.linesY;
      document = {
        ...document,
        elements: document.elements.map((item) => {
          const initial = start.get(item.id);
          return initial ? { ...item, x: Math.round(initial.x + snappedDeltaX), y: Math.round(initial.y + snappedDeltaY) } : item;
        }),
      };
    };
    const up = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      snapLinesX = [];
      snapLinesY = [];
      const operations: DesignOperation[] = [];
      const inverse: DesignOperation[] = [];
      for (const element of moving) {
        const moved = document?.elements.find((item) => item.id === element.id);
        const initial = start.get(element.id)!;
        if (!moved || (moved.x === initial.x && moved.y === initial.y)) continue;
        operations.push({ kind: 'update', elementId: element.id, changes: { x: moved.x, y: moved.y } });
        inverse.push({ kind: 'update', elementId: element.id, changes: initial });
      }
      await apply(operations, m['design.operation_move']({ name: moving.length === 1 ? moving[0].name : String(moving.length) }), { inverse });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  async function updateSelected(changes: Partial<DesignElement>, summary = selected?.name ?? '') {
    if (!selected) return;
    const inverseChanges = Object.fromEntries(Object.keys(changes).map((key) => [key, selected[key as keyof DesignElement]])) as Partial<DesignElement>;
    const operations: DesignOperation[] = [{ kind: 'update', elementId: selected.id, changes }];
    const inverse: DesignOperation[] = [{ kind: 'update', elementId: selected.id, changes: inverseChanges }];
    if (selected.type === 'frame' && ['x', 'y', 'width', 'height'].some((key) => key in changes)) {
      const nextFrame = { ...selected, ...changes };
      for (const child of pageElements.filter((element) => element.parentId === selected.id)) {
        const childChanges = constrainedChildChanges(child, selected, nextFrame);
        operations.push({ kind: 'update', elementId: child.id, changes: childChanges });
        inverse.push({
          kind: 'update',
          elementId: child.id,
          changes: Object.fromEntries(Object.keys(childChanges).map((key) => [key, child[key as keyof DesignElement]])) as Partial<DesignElement>,
        });
      }
    }
    await apply(operations, m['design.operation_update']({ name: summary }), { inverse });
  }

  async function updateElement(element: DesignElement, changes: Partial<DesignElement>) {
    selectedIds = [element.id];
    const inverse = Object.fromEntries(Object.keys(changes).map((key) => [key, element[key as keyof DesignElement]])) as Partial<DesignElement>;
    await apply([{ kind: 'update', elementId: element.id, changes }], m['design.operation_update']({ name: element.name }), {
      inverse: [{ kind: 'update', elementId: element.id, changes: inverse }],
    });
  }

  async function removeSelected() {
    const selectedSet = new Set(selectedIds);
    const targets = selectedElements.filter((element) => !element.locked && !ancestorSelected(element, selectedSet));
    if (!targets.length) return;
    const removedIds = new Set<string>();
    for (const target of targets) {
      removedIds.add(target.id);
      let changed = true;
      while (changed) {
        changed = false;
        for (const element of pageElements) if (element.parentId && removedIds.has(element.parentId) && !removedIds.has(element.id)) {
          removedIds.add(element.id);
          changed = true;
        }
      }
    }
    const snapshots = pageElements.filter((element) => removedIds.has(element.id)).sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)) || a.order - b.order);
    if (await apply(targets.map((element) => ({ kind: 'delete', elementId: element.id })), m['design.operation_delete']({ name: targets.length === 1 ? targets[0].name : String(targets.length) }), {
      inverse: snapshots.map((element) => ({ kind: 'create', element })),
    })) selectedIds = [];
  }

  function ancestorSelected(element: DesignElement, ids: Set<string>): boolean {
    let parentId = element.parentId;
    while (parentId) {
      if (ids.has(parentId)) return true;
      parentId = pageElements.find((item) => item.id === parentId)?.parentId ?? null;
    }
    return false;
  }

  async function reorder(direction: -1 | 1) {
    if (!selected) return;
    const siblings = pageElements.filter((element) => element.parentId === selected.parentId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((element) => element.id === selected.id);
    const other = siblings[index + direction];
    if (!other) return;
    await apply([
      { kind: 'reorder', elementId: selected.id, order: other.order },
      { kind: 'reorder', elementId: other.id, order: selected.order },
    ], m['design.operation_update']({ name: selected.name }), {
      inverse: [
        { kind: 'reorder', elementId: selected.id, order: selected.order },
        { kind: 'reorder', elementId: other.id, order: other.order },
      ],
    });
  }

  async function alignSelection(mode: AlignMode) {
    const elements = selectedElements.filter((element) => !element.locked);
    if (elements.length < 2) return;
    const left = Math.min(...elements.map((element) => element.x));
    const right = Math.max(...elements.map((element) => element.x + element.width));
    const top = Math.min(...elements.map((element) => element.y));
    const bottom = Math.max(...elements.map((element) => element.y + element.height));
    const changes = new Map<string, Partial<DesignElement>>();
    if (mode === 'distribute-x' && elements.length >= 3) {
      const ordered = [...elements].sort((a, b) => a.x - b.x);
      const totalWidth = ordered.reduce((total, element) => total + element.width, 0);
      const gap = (right - left - totalWidth) / (ordered.length - 1);
      let x = left;
      for (const element of ordered) {
        changes.set(element.id, { x });
        x += element.width + gap;
      }
    } else if (mode === 'distribute-y' && elements.length >= 3) {
      const ordered = [...elements].sort((a, b) => a.y - b.y);
      const totalHeight = ordered.reduce((total, element) => total + element.height, 0);
      const gap = (bottom - top - totalHeight) / (ordered.length - 1);
      let y = top;
      for (const element of ordered) {
        changes.set(element.id, { y });
        y += element.height + gap;
      }
    } else for (const element of elements) {
      if (mode === 'left') changes.set(element.id, { x: left });
      else if (mode === 'hcenter') changes.set(element.id, { x: left + (right - left - element.width) / 2 });
      else if (mode === 'right') changes.set(element.id, { x: right - element.width });
      else if (mode === 'top') changes.set(element.id, { y: top });
      else if (mode === 'vcenter') changes.set(element.id, { y: top + (bottom - top - element.height) / 2 });
      else if (mode === 'bottom') changes.set(element.id, { y: bottom - element.height });
    }
    const operations: DesignOperation[] = [];
    const inverse: DesignOperation[] = [];
    for (const element of elements) {
      const elementChanges = changes.get(element.id);
      if (!elementChanges) continue;
      operations.push({ kind: 'update', elementId: element.id, changes: elementChanges });
      inverse.push({ kind: 'update', elementId: element.id, changes: Object.fromEntries(Object.keys(elementChanges).map((key) => [key, element[key as keyof DesignElement]])) as Partial<DesignElement> });
    }
    await apply(operations, m['design.operation_align']({ count: String(elements.length) }), { inverse });
  }

  async function combineSelection(operation: DesignBooleanOperation) {
    const elements = [...selectedElements].filter((element) => !element.locked).sort((a, b) => a.order - b.order);
    if (elements.length < 2) return;
    try {
      const result = combineDesignElements(elements, operation);
      const path = designElementSchema.parse({
        ...elementDefaults('path', result.x, result.y),
        id: uuidv7(),
        name: `${booleanLabel(operation)} ${elements.length}`,
        ...result,
        pathPoints: [],
        pathSubpaths: result.subpaths,
        pathClosed: true,
        fillRule: 'evenodd',
        fill: elements[0].fill === 'transparent' ? '#7c5cff' : elements[0].fill,
        fills: elements[0].fills,
        stroke: elements[0].stroke,
        strokes: elements[0].strokes,
        strokeWidth: elements[0].strokeWidth,
      });
      const forward: DesignOperation[] = [...elements.map((element) => ({ kind: 'delete', elementId: element.id } as DesignOperation)), { kind: 'create', element: path }];
      const inverse: DesignOperation[] = [{ kind: 'delete', elementId: path.id }, ...elements.map((element) => ({ kind: 'create', element } as DesignOperation))];
      if (await apply(forward, m['design.operation_combine']({ operation: booleanLabel(operation), count: String(elements.length) }), { inverse })) selectedIds = [path.id];
    } catch (error) {
      toast.error(error instanceof Error ? error.message : m['design.error_save']());
    }
  }

  function booleanLabel(operation: DesignBooleanOperation): string {
    if (operation === 'union') return m['design.union']();
    if (operation === 'subtract') return m['design.subtract']();
    if (operation === 'intersect') return m['design.intersect']();
    return m['design.exclude']();
  }

  async function createMask() {
    const elements = [...selectedElements].filter((element) => !element.locked).sort((a, b) => a.order - b.order);
    if (elements.length < 2) return;
    const mask = elements[0];
    const targets = elements.slice(1);
    const forward: DesignOperation[] = [
      { kind: 'update', elementId: mask.id, changes: { isMask: true } },
      ...targets.map((element) => ({ kind: 'update', elementId: element.id, changes: { maskId: mask.id } } as DesignOperation)),
    ];
    const inverse: DesignOperation[] = [
      { kind: 'update', elementId: mask.id, changes: { isMask: mask.isMask } },
      ...targets.map((element) => ({ kind: 'update', elementId: element.id, changes: { maskId: element.maskId } } as DesignOperation)),
    ];
    await apply(forward, m['design.operation_mask']({ count: String(elements.length) }), { inverse });
  }

  async function releaseMasks() {
    const targets = selectedElements.filter((element) => element.maskId);
    if (!targets.length) return;
    const maskIds = new Set(targets.map((element) => element.maskId!));
    const forward: DesignOperation[] = targets.map((element) => ({ kind: 'update', elementId: element.id, changes: { maskId: null } }));
    const inverse: DesignOperation[] = targets.map((element) => ({ kind: 'update', elementId: element.id, changes: { maskId: element.maskId } }));
    for (const maskId of maskIds) {
      const mask = pageElements.find((element) => element.id === maskId);
      if (!mask) continue;
      forward.push({ kind: 'update', elementId: mask.id, changes: { isMask: false } });
      inverse.push({ kind: 'update', elementId: mask.id, changes: { isMask: mask.isMask } });
    }
    await apply(forward, m['design.release_mask'](), { inverse });
  }

  async function applyAutoLayout() {
    const frame = selected?.type === 'frame' ? selected : selectedElements.find((element) => element.type === 'frame');
    if (!frame) return;
    const selectedChildren = selectedElements.filter((element) => element.id !== frame.id);
    const existingChildren = pageElements.filter((element) => element.parentId === frame.id);
    const children = selectedChildren.length ? selectedChildren : existingChildren;
    if (!children.length) return;
    const changes = autoLayoutChanges(frame, children);
    const forward: DesignOperation[] = [];
    const inverse: DesignOperation[] = [];
    children.forEach((child, index) => {
      if (child.parentId !== frame.id) {
        forward.push({ kind: 'reparent', elementId: child.id, parentId: frame.id, order: index });
        inverse.unshift({ kind: 'reparent', elementId: child.id, parentId: child.parentId, order: child.order });
      }
      const childChanges = changes.get(child.id);
      if (childChanges) {
        forward.push({ kind: 'update', elementId: child.id, changes: childChanges });
        inverse.unshift({ kind: 'update', elementId: child.id, changes: Object.fromEntries(Object.keys(childChanges).map((key) => [key, child[key as keyof DesignElement]])) as Partial<DesignElement> });
      }
    });
    await apply(forward, m['design.operation_layout']({ name: frame.name }), { inverse });
  }

  async function addGuide(axis: 'x' | 'y') {
    if (!page) return;
    const guide = { id: uuidv7(), axis, position: axis === 'x' ? page.width / 2 : page.height / 2 } as const;
    await apply([{ kind: 'add-guide', guide }], m['design.operation_guide'](), { inverse: [{ kind: 'delete-guide', guideId: guide.id }] });
  }

  async function removeGuide(guideId: string) {
    const guide = document?.guides.find((item) => item.id === guideId);
    if (!guide) return;
    await apply([{ kind: 'delete-guide', guideId }], m['design.operation_guide'](), { inverse: [{ kind: 'add-guide', guide }] });
  }

  function startGuideDrag(event: PointerEvent, guideId: string) {
    const guide = document?.guides.find((item) => item.id === guideId);
    if (!guide || !document) return;
    event.preventDefault();
    event.stopPropagation();
    const start = guide.position;
    const move = (moveEvent: PointerEvent) => {
      if (!document) return;
      const point = pagePoint(moveEvent);
      const position = guide.axis === 'x' ? point.x : point.y;
      document = { ...document, guides: document.guides.map((item) => item.id === guide.id ? { ...item, position } : item) };
    };
    const up = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const current = document?.guides.find((item) => item.id === guide.id)?.position;
      if (current === undefined || current === start) return;
      await apply([{ kind: 'update-guide', guideId: guide.id, position: current }], m['design.operation_guide'](), {
        inverse: [{ kind: 'update-guide', guideId: guide.id, position: start }],
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function startPathPointDrag(event: PointerEvent, index: number) {
    if (!selected || selected.type !== 'path' || !document) return;
    event.preventDefault();
    event.stopPropagation();
    const source = selected.pathSubpaths[0] ?? selected.pathPoints;
    const original = source.map((point) => ({ ...point }));
    const move = (moveEvent: PointerEvent) => {
      if (!document || !selected) return;
      const point = pagePoint(moveEvent);
      const next = source.map((item, pointIndex) => pointIndex === index ? { ...item, x: point.x - selected.x, y: point.y - selected.y } : item);
      document = {
        ...document,
        elements: document.elements.map((element) => element.id === selected.id
          ? { ...element, ...(element.pathSubpaths.length ? { pathSubpaths: [next, ...element.pathSubpaths.slice(1)] } : { pathPoints: next }) }
          : element),
      };
    };
    const up = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const latest = document?.elements.find((element) => element.id === selected?.id);
      if (!latest) return;
      const changes = latest.pathSubpaths.length ? { pathSubpaths: latest.pathSubpaths } : { pathPoints: latest.pathPoints };
      const inverse = latest.pathSubpaths.length ? { pathSubpaths: [original, ...latest.pathSubpaths.slice(1)] } : { pathPoints: original };
      await apply([{ kind: 'update', elementId: latest.id, changes }], m['design.operation_update']({ name: latest.name }), {
        inverse: [{ kind: 'update', elementId: latest.id, changes: inverse }],
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  async function importFiles(files: File[]) {
    for (const file of files) await importAsset(file);
  }

  async function imageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
    try {
      const bitmap = await createImageBitmap(file);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    } catch {
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('Invalid image'));
          image.src = url;
        });
        return { width: image.naturalWidth || null, height: image.naturalHeight || null };
      } catch {
        return { width: null, height: null };
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }

  async function importAsset(file: File) {
    if (!document || saving || !file.type.startsWith('image/')) return;
    saving = true;
    try {
      const dimensions = await imageDimensions(file);
      const form = new FormData();
      form.set('file', file);
      form.set('baseRevision', String(document.revision));
      if (dimensions.width) form.set('width', String(dimensions.width));
      if (dimensions.height) form.set('height', String(dimensions.height));
      const csrf = getCsrfToken();
      const response = await fetch(`/api/agent-room/workspaces/${workspaceId}/designs/${nodeId}/assets`, {
        method: 'POST',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
        body: form,
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || m['design.asset_error']());
      document = payload.data;
      const asset = document!.assets.at(-1)!;
      saving = false;
      await insertAsset(asset);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : m['design.asset_error']());
    } finally {
      saving = false;
      if (assetInput) assetInput.value = '';
    }
  }

  async function insertAsset(asset: DesignAsset) {
    if (!page) return;
    const naturalWidth = asset.width ?? 320;
    const naturalHeight = asset.height ?? 240;
    const scale = Math.min(1, 640 / naturalWidth, 480 / naturalHeight);
    const element = designElementSchema.parse({
      ...elementDefaults('image', Math.max(0, page.width / 2 - naturalWidth * scale / 2), Math.max(0, page.height / 2 - naturalHeight * scale / 2)),
      name: asset.name,
      width: Math.max(1, naturalWidth * scale),
      height: Math.max(1, naturalHeight * scale),
      assetId: asset.id,
    });
    if (await apply([{ kind: 'create', element }], m['design.operation_import']({ name: asset.name }), {
      inverse: [{ kind: 'delete', elementId: element.id }],
    })) selectedIds = [element.id];
  }

  async function deleteAsset(asset: DesignAsset) {
    if (document?.elements.some((element) => element.assetId === asset.id)) return;
    await apply([{ kind: 'delete-asset', assetId: asset.id }], m['design.operation_delete']({ name: asset.name }), {
      inverse: [{ kind: 'add-asset', asset }],
    });
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (files.length) void importFiles(files);
  }

  function handlePaste(event: ClipboardEvent) {
    if (!editorRoot?.contains(globalThis.document?.activeElement ?? null)) return;
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    void importFiles(files);
  }

  function exportName(): string {
    return (document?.name || 'design').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'design';
  }

  async function serializedSvg(): Promise<string> {
    if (!pageSvg) throw new Error(m['design.export_error']());
    const clone = pageSvg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(page?.width ?? 1));
    clone.setAttribute('height', String(page?.height ?? 1));
    clone.querySelectorAll('[data-design-selection],[data-design-guide],[data-design-ruler],[data-design-snap]').forEach((element) => element.remove());
    if (page?.background && page.background !== 'transparent') {
      const background = globalThis.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      background.setAttribute('width', '100%');
      background.setAttribute('height', '100%');
      background.setAttribute('fill', page.background);
      clone.insertBefore(background, clone.firstChild);
    }
    for (const image of Array.from(clone.querySelectorAll('image'))) {
      const href = image.getAttribute('href');
      if (!href?.startsWith('/')) continue;
      const response = await fetch(href);
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      image.setAttribute('href', dataUrl);
    }
    return new XMLSerializer().serializeToString(clone);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function rasterBlob(format: 'png' | 'jpeg' | 'webp', maxDimension = Number.POSITIVE_INFINITY): Promise<Blob> {
    const svg = await serializedSvg();
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(m['design.export_error']()));
        image.src = svgUrl;
      });
      const canvas = globalThis.document.createElement('canvas');
      const scale = Math.min(1, maxDimension / Math.max(page!.width, page!.height));
      canvas.width = Math.max(1, Math.round(page!.width * scale));
      canvas.height = Math.max(1, Math.round(page!.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error(m['design.export_error']());
      if (format === 'jpeg') {
        context.fillStyle = page?.background === 'transparent' ? '#ffffff' : page?.background ?? '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(m['design.export_error']())), `image/${format}`, 0.92));
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  async function uploadThumbnail(revision: number) {
    if (!document || document.revision !== revision || !pageSvg) return;
    try {
      const form = new FormData();
      form.set('file', new File([await rasterBlob('png', 640)], `${nodeId}.png`, { type: 'image/png' }));
      form.set('revision', String(revision));
      const csrf = getCsrfToken();
      const response = await fetch(`/api/agent-room/workspaces/${workspaceId}/designs/${nodeId}/thumbnail`, {
        method: 'POST',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
        body: form,
      });
      if (response.ok && document?.revision === revision) thumbnailRevision = revision;
    } catch {
      // The live SVG remains the fallback when thumbnail generation is unavailable.
    }
  }

  async function exportDesign(format: 'svg' | 'png' | 'jpeg' | 'webp' | 'pdf') {
    if (!page || exporting) return;
    exporting = true;
    try {
      if (format === 'svg') {
        downloadBlob(new Blob([await serializedSvg()], { type: 'image/svg+xml' }), `${exportName()}.svg`);
        return;
      }
      const blob = await rasterBlob(format === 'pdf' ? 'png' : format);
      if (format !== 'pdf') {
        downloadBlob(blob, `${exportName()}.${format === 'jpeg' ? 'jpg' : format}`);
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const csrf = getCsrfToken();
      const response = await fetch(`/api/agent-room/workspaces/${workspaceId}/designs/${nodeId}/export/pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        body: JSON.stringify({ dataUrl, width: page.width, height: page.height, name: exportName() }),
      });
      if (!response.ok) throw new Error((await response.json()).error || m['design.export_error']());
      downloadBlob(await response.blob(), `${exportName()}.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : m['design.export_error']());
    } finally {
      exporting = false;
    }
  }

  async function undo() {
    const entry = undoStack.at(-1);
    if (!entry) return;
    if (await apply(entry.inverse, m['design.undo'](), { record: false })) {
      undoStack = undoStack.slice(0, -1);
      redoStack = [...redoStack, entry];
    }
  }

  async function redo() {
    const entry = redoStack.at(-1);
    if (!entry) return;
    if (await apply(entry.forward, m['design.redo'](), { record: false })) {
      redoStack = redoStack.slice(0, -1);
      undoStack = [...undoStack, entry];
    }
  }

  function fitPage() {
    if (!viewport || !page) return;
    zoom = Math.max(0.1, Math.min(1.5, Math.min((viewport.clientWidth - 96) / page.width, (viewport.clientHeight - 96) / page.height)));
  }

  function keyboard(event: KeyboardEvent) {
    if (!editorRoot?.contains(globalThis.document?.activeElement ?? null)) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void (event.shiftKey ? redo() : undo());
      return;
    }
    if (event.key === 'Enter' && tool === 'path' && penPoints.length >= 2) {
      event.preventDefault();
      void finishPath();
      return;
    }
    if (event.key === 'Escape' && tool !== 'select') {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelDrawing?.();
      penPoints = [];
      draftElement = null;
      tool = 'select';
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void removeSelected();
    }
  }

  function number(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }

  function focusEditor(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, button, select, [contenteditable="true"]')) return;
    editorRoot?.focus({ preventScroll: true });
  }

  onMount(() => {
    void load().then(fitPage);
    window.addEventListener('keydown', keyboard, { capture: true });
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', keyboard, { capture: true });
      window.removeEventListener('paste', handlePaste);
      cancelDrawing?.();
      if (thumbnailTimer) clearTimeout(thumbnailTimer);
    };
  });

  $effect(() => {
    const revision = externalRevision;
    if (!revision || saving || loading || !document || revision <= document.revision) return;
    void load(true);
  });

  $effect(() => {
    const revision = document?.revision;
    const svg = pageSvg;
    if (revision === undefined || !svg || loading || revision === thumbnailRevision) return;
    if (thumbnailTimer) clearTimeout(thumbnailTimer);
    thumbnailTimer = setTimeout(() => void uploadThumbnail(revision), 650);
    return () => {
      if (thumbnailTimer) clearTimeout(thumbnailTimer);
    };
  });
</script>

<div class={`@container/design h-full min-h-0 ${className}`}>
  <div
    bind:this={editorRoot}
    class="grid h-full min-h-0 grid-cols-[210px_minmax(0,1fr)_248px] grid-rows-[42px_minmax(0,1fr)] overflow-hidden bg-[var(--app-canvas)] text-[var(--app-text)] @max-[660px]:grid-cols-[1fr]"
    aria-label={m['design.mode_aria']()}
    tabindex="-1"
    onpointerdowncapture={focusEditor}
  >
    <header class="col-span-3 flex min-w-0 items-center gap-1 overflow-x-auto border-b border-[var(--app-border)] bg-[var(--app-surface)] px-2 @max-[660px]:col-span-1">
      {#each [
        { id: 'select' as const, icon: MousePointer2 },
        { id: 'frame' as const, icon: Frame },
        { id: 'rectangle' as const, icon: RectangleHorizontal },
        { id: 'ellipse' as const, icon: Circle },
        { id: 'text' as const, icon: Type },
        { id: 'path' as const, icon: PenTool },
      ] as item (item.id)}
        <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<Button {...props} variant={tool === item.id ? 'secondary' : 'ghost'} size="icon-sm" aria-label={toolLabel(item.id)} aria-pressed={tool === item.id} onclick={() => { tool = item.id; penPoints = []; draftElement = null; }}><item.icon size={16} /></Button>{/snippet}</Tooltip.Trigger><Tooltip.Content>{toolLabel(item.id)}</Tooltip.Content></Tooltip.Root>
      {/each}
      <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="icon-sm" aria-label={m['design.import_asset']()} onclick={() => assetInput?.click()}><ImagePlus size={16} /></Button>{/snippet}</Tooltip.Trigger><Tooltip.Content>{m['design.import_asset']()}</Tooltip.Content></Tooltip.Root>
      <input bind:this={assetInput} class="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple onchange={(event: Event) => void importFiles(Array.from((event.currentTarget as HTMLInputElement).files ?? []))} />
      <span class="mx-1 h-5 w-px bg-[var(--app-border)]"></span>
      <Button variant="ghost" size="icon-sm" disabled={!undoStack.length || saving} aria-label={m['design.undo']()} onclick={() => void undo()}><Undo2 /></Button>
      <Button variant="ghost" size="icon-sm" disabled={!redoStack.length || saving} aria-label={m['design.redo']()} onclick={() => void redo()}><Redo2 /></Button>

      <DropdownMenu.Root>
        <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<DropdownMenu.Trigger {...props} class="relative inline-flex size-8 items-center justify-center rounded-md text-[var(--app-text-soft)] hover:bg-[var(--app-border)] data-[state=open]:bg-[var(--app-accent-soft)]" aria-label={m['design.alignment']()}><AlignCenter size={15} /><ChevronDown size={8} class="absolute right-0.5 bottom-0.5" /></DropdownMenu.Trigger>{/snippet}</Tooltip.Trigger><Tooltip.Content>{m['design.alignment']()}</Tooltip.Content></Tooltip.Root>
        <DropdownMenu.Content align="start" class="w-56">
          <DropdownMenu.Item disabled={selectedElements.length < 2} onclick={() => void alignSelection('left')}><AlignHorizontalJustifyStart size={14} />{m['design.align_left']()}</DropdownMenu.Item>
          <DropdownMenu.Item disabled={selectedElements.length < 2} onclick={() => void alignSelection('hcenter')}><AlignHorizontalJustifyCenter size={14} />{m['design.align_horizontal_center']()}</DropdownMenu.Item>
          <DropdownMenu.Item disabled={selectedElements.length < 2} onclick={() => void alignSelection('right')}><AlignHorizontalJustifyEnd size={14} />{m['design.align_right']()}</DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item disabled={selectedElements.length < 2} onclick={() => void alignSelection('top')}><AlignVerticalJustifyStart size={14} />{m['design.align_top']()}</DropdownMenu.Item>
          <DropdownMenu.Item disabled={selectedElements.length < 2} onclick={() => void alignSelection('vcenter')}><AlignVerticalJustifyCenter size={14} />{m['design.align_vertical_center']()}</DropdownMenu.Item>
          <DropdownMenu.Item disabled={selectedElements.length < 2} onclick={() => void alignSelection('bottom')}><AlignVerticalJustifyEnd size={14} />{m['design.align_bottom']()}</DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item disabled={selectedElements.length < 3} onclick={() => void alignSelection('distribute-x')}><AlignHorizontalDistributeCenter size={14} />{m['design.distribute_horizontal']()}</DropdownMenu.Item>
          <DropdownMenu.Item disabled={selectedElements.length < 3} onclick={() => void alignSelection('distribute-y')}><AlignVerticalDistributeCenter size={14} />{m['design.distribute_vertical']()}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <DropdownMenu.Root>
        <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<DropdownMenu.Trigger {...props} class="relative inline-flex size-8 items-center justify-center rounded-md text-[var(--app-text-soft)] hover:bg-[var(--app-border)] data-[state=open]:bg-[var(--app-accent-soft)]" aria-label={m['design.boolean']()}><Combine size={15} /><ChevronDown size={8} class="absolute right-0.5 bottom-0.5" /></DropdownMenu.Trigger>{/snippet}</Tooltip.Trigger><Tooltip.Content>{m['design.boolean']()}</Tooltip.Content></Tooltip.Root>
        <DropdownMenu.Content align="start" class="w-52">
          {#each ['union', 'subtract', 'intersect', 'exclude'] as operation}<DropdownMenu.Item disabled={selectedElements.length < 2} onclick={() => void combineSelection(operation as DesignBooleanOperation)}>{booleanLabel(operation as DesignBooleanOperation)}</DropdownMenu.Item>{/each}
          <DropdownMenu.Separator />
          <DropdownMenu.Item disabled={selectedElements.length < 2} onclick={() => void createMask()}>{m['design.mask']()}</DropdownMenu.Item>
          <DropdownMenu.Item disabled={!selectedElements.some((element) => element.maskId)} onclick={() => void releaseMasks()}>{m['design.release_mask']()}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <DropdownMenu.Root>
        <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<DropdownMenu.Trigger {...props} class="relative inline-flex size-8 items-center justify-center rounded-md text-[var(--app-text-soft)] hover:bg-[var(--app-border)] data-[state=open]:bg-[var(--app-accent-soft)]" aria-label={m['design.rulers']()}><Ruler size={15} /><ChevronDown size={8} class="absolute right-0.5 bottom-0.5" /></DropdownMenu.Trigger>{/snippet}</Tooltip.Trigger><Tooltip.Content>{m['design.rulers']()}</Tooltip.Content></Tooltip.Root>
        <DropdownMenu.Content align="start" class="w-56">
          <DropdownMenu.CheckboxItem checked={rulersVisible} onCheckedChange={(checked: boolean) => (rulersVisible = checked)} closeOnSelect={false}>{m['design.rulers']()}</DropdownMenu.CheckboxItem>
          <DropdownMenu.CheckboxItem checked={snapEnabled} onCheckedChange={(checked: boolean) => (snapEnabled = checked)} closeOnSelect={false}><Magnet size={14} />{m['design.snap']()}</DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onclick={() => void addGuide('y')}><Plus size={14} />{m['design.add_horizontal_guide']()}</DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => void addGuide('x')}><Plus size={14} />{m['design.add_vertical_guide']()}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <div class="min-w-0 flex-1"></div>
      {#if document}<span class="hidden text-[10px] text-[var(--app-text-muted)] xl:inline">{m['design.revision']({ revision: document.revision })}</span>{/if}
      <Button variant="ghost" size="icon-sm" aria-label={m['design.zoom_out']()} onclick={() => (zoom = Math.max(0.1, zoom - 0.1))}><ZoomOut /></Button>
      <span class="w-10 text-center text-[10px] tabular-nums text-[var(--app-text-muted)]">{Math.round(zoom * 100)}%</span>
      <Button variant="ghost" size="icon-sm" aria-label={m['design.zoom_in']()} onclick={() => (zoom = Math.min(3, zoom + 0.1))}><ZoomIn /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={m['design.fit']()} onclick={fitPage}><Maximize2 /></Button>
      <DropdownMenu.Root>
        <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<DropdownMenu.Trigger {...props} class="relative inline-flex size-8 items-center justify-center rounded-md text-[var(--app-text-soft)] hover:bg-[var(--app-border)] data-[state=open]:bg-[var(--app-accent-soft)]" disabled={exporting} aria-label={m['design.export']()}><Download size={15} /><ChevronDown size={8} class="absolute right-0.5 bottom-0.5" /></DropdownMenu.Trigger>{/snippet}</Tooltip.Trigger><Tooltip.Content>{m['design.export']()}</Tooltip.Content></Tooltip.Root>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item onclick={() => void exportDesign('svg')}>{m['design.export_svg']()}</DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => void exportDesign('png')}>{m['design.export_png']()}</DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => void exportDesign('jpeg')}>{m['design.export_jpeg']()}</DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => void exportDesign('webp')}>{m['design.export_webp']()}</DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => void exportDesign('pdf')}>{m['design.export_pdf']()}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </header>

    <aside class="grid min-h-0 grid-rows-[minmax(0,1fr)_190px] border-r border-[var(--app-border)] bg-[var(--app-surface)] @max-[660px]:hidden">
      <section class="min-h-0 overflow-y-auto">
        <div class="sticky top-0 z-10 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[10px] font-semibold uppercase text-[var(--app-text-muted)]">{m['design.layers']()}</div>
        {#if loading}<p class="p-3 text-xs text-[var(--app-text-muted)]">{m['design.loading']()}</p>{:else}
          <div class="flex flex-col-reverse p-1">
            {#each pageElements as element (element.id)}
              <div class={`group flex h-8 items-center gap-1 rounded px-1 ${selectedIds.includes(element.id) ? 'bg-[var(--app-accent-soft)] text-[var(--app-text)]' : 'text-[var(--app-text-soft)] hover:bg-[var(--app-surface-raised)]'}`} style:padding-left={`${4 + (element.parentId ? 12 : 0)}px`}>
                <button class="min-w-0 flex-1 truncate px-1 text-left text-[11px]" onclick={(event) => { if (event.shiftKey) selectedIds = selectedIds.includes(element.id) ? selectedIds.filter((id) => id !== element.id) : [...selectedIds, element.id]; else selectedIds = [element.id]; }}>{element.name}</button>
                <button class="grid size-6 place-items-center text-[var(--app-text-muted)] hover:text-[var(--app-text)]" aria-label={element.visible ? m['design.hide']() : m['design.show']()} onclick={() => void updateElement(element, { visible: !element.visible })}>{#if element.visible}<Eye size={12} />{:else}<EyeOff size={12} />{/if}</button>
                <button class="grid size-6 place-items-center text-[var(--app-text-muted)] hover:text-[var(--app-text)]" aria-label={element.locked ? m['design.unlock']() : m['design.lock']()} onclick={() => void updateElement(element, { locked: !element.locked })}>{#if element.locked}<Lock size={12} />{:else}<Unlock size={12} />{/if}</button>
              </div>
            {/each}
          </div>
        {/if}
      </section>
      <section class="min-h-0 overflow-y-auto border-t border-[var(--app-border)]">
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-[10px] font-semibold uppercase text-[var(--app-text-muted)]"><span>{m['design.assets']()}</span><Button variant="ghost" size="icon-sm" class="size-6" aria-label={m['design.import_asset']()} onclick={() => assetInput?.click()}><Plus size={12} /></Button></div>
        {#if !document?.assets.length}<p class="p-3 text-[10px] leading-4 text-[var(--app-text-muted)]">{m['design.assets_empty']()}</p>{:else}
          <div class="grid grid-cols-2 gap-1.5 p-2">
            {#each document.assets as asset (asset.id)}
              <div class="group relative overflow-hidden border border-[var(--app-border)] bg-[var(--app-canvas)]">
                <button class="block aspect-square w-full" title={m['design.insert_asset']()} onclick={() => void insertAsset(asset)}><img class="h-full w-full object-contain" src={`/api/agent-room/workspaces/${workspaceId}/fs/raw?path=${encodeURIComponent(asset.path)}`} alt={asset.name} /></button>
                <span class="block truncate border-t border-[var(--app-border)] px-1.5 py-1 text-[9px]">{asset.name}</span>
                {#if !document.elements.some((element) => element.assetId === asset.id)}<button class="absolute top-1 right-1 grid size-6 place-items-center bg-[var(--app-surface)] text-[var(--app-danger)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100" aria-label={m['design.delete']()} onclick={() => void deleteAsset(asset)}><Trash2 size={11} /></button>{/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </aside>

    <main class="relative min-h-0 min-w-0 overflow-auto bg-[var(--app-canvas)]" bind:this={viewport} ondragover={(event) => event.preventDefault()} ondrop={handleDrop}>
      {#if errorMessage}
        <div class="grid h-full place-items-center p-8 text-center"><div><p class="text-sm text-[var(--app-danger)]">{errorMessage}</p><Button class="mt-3" variant="outline" size="sm" onclick={() => void load()}>{m['workspace_access.retry']()}</Button></div></div>
      {:else if loading || !document || !page}
        <div class="grid h-full place-items-center text-xs text-[var(--app-text-muted)]">{m['design.loading']()}</div>
      {:else}
        <div class="relative min-h-full min-w-full p-12" style:width={`${Math.max(viewport?.clientWidth ?? 0, page.width * zoom + 96)}px`} style:height={`${Math.max(viewport?.clientHeight ?? 0, page.height * zoom + 96)}px`}>
          <svg
            bind:this={pageSvg}
            class={`mx-auto block shadow-[0_8px_30px_rgba(0,0,0,0.18)] ${tool === 'select' ? 'cursor-default [&_g[data-design-element]]:cursor-move' : 'cursor-crosshair'}`}
            width={page.width * zoom}
            height={page.height * zoom}
            viewBox={`0 0 ${page.width} ${page.height}`}
            style:background={page.background}
            onpointerdown={canvasPointerDown}
            role="application"
            aria-label={page.name}
          >
            <DesignRenderer elements={renderedElements} assets={document.assets} {workspaceId} {selectedIds} />
            {#if rulersVisible}
              <g data-design-ruler pointer-events="none" opacity="0.65">
                <rect x="0" y="0" width={page.width} height="18" fill="var(--app-surface)" />
                <rect x="0" y="0" width="18" height={page.height} fill="var(--app-surface)" />
                {#each rulerXTicks as tick}<line x1={tick} y1="0" x2={tick} y2="10" stroke="var(--app-text-muted)" stroke-width="1" vector-effect="non-scaling-stroke" /><text x={tick + 3} y="10" font-size="8" fill="var(--app-text-muted)">{tick}</text>{/each}
                {#each rulerYTicks as tick}<line x1="0" y1={tick} x2="10" y2={tick} stroke="var(--app-text-muted)" stroke-width="1" vector-effect="non-scaling-stroke" /><text x="3" y={tick + 10} font-size="8" fill="var(--app-text-muted)">{tick}</text>{/each}
              </g>
            {/if}
            {#each document.guides as guide (guide.id)}
              <line data-design-guide={guide.id} x1={guide.axis === 'x' ? guide.position : 0} y1={guide.axis === 'y' ? guide.position : 0} x2={guide.axis === 'x' ? guide.position : page.width} y2={guide.axis === 'y' ? guide.position : page.height} stroke="var(--app-secondary)" stroke-width="1" vector-effect="non-scaling-stroke" class="cursor-col-resize" />
            {/each}
            {#each snapLinesX as line}<line data-design-snap x1={line} x2={line} y1="0" y2={page.height} stroke="var(--app-accent)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" pointer-events="none" />{/each}
            {#each snapLinesY as line}<line data-design-snap y1={line} y2={line} x1="0" x2={page.width} stroke="var(--app-accent)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" pointer-events="none" />{/each}
            {#if selected?.type === 'path'}
              {@const points = selected.pathSubpaths[0] ?? selected.pathPoints}
              <g data-design-selection>
                {#each points as point, index}<circle cx={selected.x + point.x} cy={selected.y + point.y} r={5 / zoom} fill="var(--app-surface)" stroke="var(--app-accent)" stroke-width={1.5 / zoom} class="cursor-move" role="button" aria-label={`${m['design.path_points']()} ${index + 1}`} tabindex="0" onpointerdown={(event) => startPathPointDrag(event, index)} />{/each}
              </g>
            {/if}
          </svg>
          {#if !renderedElements.length}<div class="pointer-events-none absolute inset-0 grid place-items-center p-10 text-center text-xs text-[var(--app-text-muted)]">{m['design.empty']()}</div>{/if}
          {#if tool === 'path' && penPoints.length}<div class="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 bg-[var(--app-surface)] px-3 py-1.5 text-[10px] text-[var(--app-text-soft)] shadow-md">{m['design.finish_path']()}</div>{/if}
        </div>
      {/if}
    </main>

    <aside class="min-h-0 overflow-y-auto border-l border-[var(--app-border)] bg-[var(--app-surface)] @max-[660px]:hidden">
      <div class="sticky top-0 z-10 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[10px] font-semibold uppercase text-[var(--app-text-muted)]">{m['design.properties']()}</div>
      {#if selected}
        <div class="space-y-4 p-3 text-[11px]">
          <label class="block space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.name']()}</span><Input value={selected.name} onchange={(event: Event) => void updateSelected({ name: (event.currentTarget as HTMLInputElement).value })} /></label>
          <section class="space-y-2"><h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.position']()}</h3><div class="grid grid-cols-2 gap-2"><label class="space-y-1"><span class="text-[var(--app-text-muted)]">X</span><Input type="number" value={selected.x} onchange={(event: Event) => void updateSelected({ x: number(event) })} /></label><label class="space-y-1"><span class="text-[var(--app-text-muted)]">Y</span><Input type="number" value={selected.y} onchange={(event: Event) => void updateSelected({ y: number(event) })} /></label><label class="col-span-2 space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.rotation']()}</span><Input type="number" value={selected.rotation} onchange={(event: Event) => void updateSelected({ rotation: number(event) })} /></label></div></section>
          <section class="space-y-2"><h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.size']()}</h3><div class="grid grid-cols-2 gap-2"><label class="space-y-1"><span class="text-[var(--app-text-muted)]">W</span><Input type="number" min="1" value={selected.width} onchange={(event: Event) => void updateSelected({ width: Math.max(1, number(event)) })} /></label><label class="space-y-1"><span class="text-[var(--app-text-muted)]">H</span><Input type="number" min="1" value={selected.height} onchange={(event: Event) => void updateSelected({ height: Math.max(1, number(event)) })} /></label></div></section>
          <section class="space-y-2"><h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.appearance']()}</h3><div class="grid grid-cols-2 gap-2"><label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.stroke_width']()}</span><Input type="number" min="0" value={selected.strokeWidth} onchange={(event: Event) => void updateSelected({ strokeWidth: Math.max(0, number(event)) })} /></label><label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.radius']()}</span><Input type="number" min="0" value={selected.cornerRadius} onchange={(event: Event) => void updateSelected({ cornerRadius: Math.max(0, number(event)) })} /></label><label class="col-span-2 space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.opacity']()}</span><Input type="number" min="0" max="100" value={Math.round(selected.opacity * 100)} onchange={(event: Event) => void updateSelected({ opacity: Math.max(0, Math.min(1, number(event) / 100)) })} /></label></div><label class="block space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.blend_mode']()}</span><NativeSelect.Root class="w-full" value={selected.blendMode} onchange={(event: Event) => void updateSelected({ blendMode: (event.currentTarget as HTMLSelectElement).value as DesignElement['blendMode'] })}><NativeSelect.Option value="normal">{m['design.blend_normal']()}</NativeSelect.Option><NativeSelect.Option value="multiply">{m['design.blend_multiply']()}</NativeSelect.Option><NativeSelect.Option value="screen">{m['design.blend_screen']()}</NativeSelect.Option><NativeSelect.Option value="overlay">{m['design.blend_overlay']()}</NativeSelect.Option><NativeSelect.Option value="darken">{m['design.blend_darken']()}</NativeSelect.Option><NativeSelect.Option value="lighten">{m['design.blend_lighten']()}</NativeSelect.Option></NativeSelect.Root></label></section>
          {#if selected.type !== 'image'}<DesignPaintEditor title={m['design.fill']()} paints={selected.fills} fallbackColor={selected.fill} onChange={(fills: DesignPaint[]) => void updateSelected({ fills, fill: fills.length ? 'transparent' : selected.fill })} />{/if}
          <DesignPaintEditor title={m['design.stroke']()} paints={selected.strokes} fallbackColor={selected.stroke} onChange={(strokes: DesignPaint[]) => void updateSelected({ strokes, stroke: strokes.length ? 'transparent' : selected.stroke, strokeWidth: strokes.length && !selected.strokeWidth ? 1 : selected.strokeWidth })} />
          <section class="space-y-2"><div class="flex items-center justify-between"><h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.effects']()}</h3><div class="flex gap-1"><Button variant="ghost" size="sm" class="h-6 px-1.5 text-[9px]" onclick={() => void updateSelected({ effects: [...selected.effects, { type: 'drop-shadow', color: '#00000040', x: 0, y: 4, blur: 12, spread: 0, visible: true }] })}>{m['design.add_shadow']()}</Button><Button variant="ghost" size="sm" class="h-6 px-1.5 text-[9px]" onclick={() => void updateSelected({ effects: [...selected.effects, { type: 'layer-blur', blur: 8, visible: true }] })}>{m['design.add_blur']()}</Button></div></div>{#each selected.effects as effect, index}<div class="grid grid-cols-[1fr_64px_26px] items-center gap-1.5 border border-[var(--app-border)] p-2"><span>{effect.type === 'drop-shadow' || effect.type === 'inner-shadow' ? m['design.shadow']() : m['design.blur']()}</span><Input class="h-7" type="number" min="0" value={effect.blur} onchange={(event: Event) => { const effects = selected.effects.map((item, itemIndex) => itemIndex === index ? { ...item, blur: Math.max(0, number(event)) } as DesignEffect : item); void updateSelected({ effects }); }} /><Button variant="ghost" size="icon-sm" class="size-6" aria-label={m['design.delete']()} onclick={() => void updateSelected({ effects: selected.effects.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={11} /></Button></div>{/each}</section>
          {#if selected.type === 'text'}<section class="space-y-2"><h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.content']()}</h3><Textarea value={selected.text} onchange={(event: Event) => void updateSelected({ text: (event.currentTarget as HTMLTextAreaElement).value })} /><div class="grid grid-cols-2 gap-2"><label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.font_size']()}</span><Input type="number" min="4" value={selected.fontSize} onchange={(event: Event) => void updateSelected({ fontSize: Math.max(4, number(event)) })} /></label><label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.font_weight']()}</span><Input type="number" min="100" max="900" step="100" value={selected.fontWeight} onchange={(event: Event) => void updateSelected({ fontWeight: Math.max(100, Math.min(900, number(event))) })} /></label></div><div class="grid grid-cols-3 gap-1">{#each [{ value: 'left' as const, icon: AlignLeft, label: m['design.align_left']() }, { value: 'center' as const, icon: AlignCenter, label: m['design.align_center']() }, { value: 'right' as const, icon: AlignRight, label: m['design.align_right']() }] as alignment}<Button variant={selected.textAlign === alignment.value ? 'secondary' : 'outline'} size="sm" aria-label={alignment.label} onclick={() => void updateSelected({ textAlign: alignment.value })}><alignment.icon size={14} /></Button>{/each}</div></section>{/if}
          {#if selected.type === 'path'}<section class="space-y-2"><div class="flex items-center justify-between"><h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.path_points']()}</h3><span class="tabular-nums text-[var(--app-text-muted)]">{(selected.pathSubpaths[0] ?? selected.pathPoints).length}</span></div><label class="flex items-center justify-between gap-3"><span>{m['design.close_path']()}</span><Switch size="sm" checked={selected.pathClosed} onCheckedChange={(checked: boolean) => void updateSelected({ pathClosed: checked })} /></label></section>{/if}
          {#if selected.type === 'image'}<section class="space-y-2"><h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.image_fit']()}</h3><NativeSelect.Root class="w-full" value={selected.imageFit} onchange={(event: Event) => void updateSelected({ imageFit: (event.currentTarget as HTMLSelectElement).value as DesignElement['imageFit'] })}><NativeSelect.Option value="cover">{m['design.fit_cover']()}</NativeSelect.Option><NativeSelect.Option value="contain">{m['design.fit_contain']()}</NativeSelect.Option><NativeSelect.Option value="fill">{m['design.fit_fill']()}</NativeSelect.Option></NativeSelect.Root></section>{/if}
          {#if selected.type === 'frame'}<section class="space-y-2"><h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.auto_layout']()}</h3><NativeSelect.Root class="w-full" value={selected.layoutMode} onchange={(event: Event) => void updateSelected({ layoutMode: (event.currentTarget as HTMLSelectElement).value as DesignElement['layoutMode'] })}><NativeSelect.Option value="none">{m['design.layout_none']()}</NativeSelect.Option><NativeSelect.Option value="horizontal">{m['design.layout_horizontal']()}</NativeSelect.Option><NativeSelect.Option value="vertical">{m['design.layout_vertical']()}</NativeSelect.Option><NativeSelect.Option value="grid">{m['design.layout_grid']()}</NativeSelect.Option></NativeSelect.Root><div class="grid grid-cols-2 gap-2"><label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.gap']()}</span><Input type="number" min="0" value={selected.layoutGap} onchange={(event: Event) => void updateSelected({ layoutGap: Math.max(0, number(event)) })} /></label><label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.padding']()}</span><Input type="number" min="0" value={selected.layoutPaddingTop} onchange={(event: Event) => { const value = Math.max(0, number(event)); void updateSelected({ layoutPaddingTop: value, layoutPaddingRight: value, layoutPaddingBottom: value, layoutPaddingLeft: value }); }} /></label>{#if selected.layoutMode === 'grid'}<label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.columns']()}</span><Input type="number" min="1" value={selected.layoutGridColumns} onchange={(event: Event) => void updateSelected({ layoutGridColumns: Math.max(1, number(event)) })} /></label>{/if}</div><label class="flex items-center justify-between gap-3"><span>{m['design.wrap']()}</span><Switch size="sm" checked={selected.layoutWrap} onCheckedChange={(checked: boolean) => void updateSelected({ layoutWrap: checked })} /></label><label class="flex items-center justify-between gap-3"><span>{m['design.clip_content']()}</span><Switch size="sm" checked={selected.clipContent} onCheckedChange={(checked: boolean) => void updateSelected({ clipContent: checked })} /></label><Button class="w-full" variant="outline" size="sm" onclick={() => void applyAutoLayout()}><Sparkles size={13} />{m['design.apply_layout']()}</Button></section>{/if}
          {#if selected.parentId}<section class="space-y-2"><h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.constraints']()}</h3><div class="grid grid-cols-2 gap-2"><label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.horizontal']()}</span><NativeSelect.Root value={selected.constraintHorizontal} onchange={(event: Event) => void updateSelected({ constraintHorizontal: (event.currentTarget as HTMLSelectElement).value as DesignElement['constraintHorizontal'] })}><NativeSelect.Option value="left">{m['design.align_left']()}</NativeSelect.Option><NativeSelect.Option value="right">{m['design.align_right']()}</NativeSelect.Option><NativeSelect.Option value="left-right">{m['design.constraint_left_right']()}</NativeSelect.Option><NativeSelect.Option value="center">{m['design.align_center']()}</NativeSelect.Option><NativeSelect.Option value="scale">{m['design.constraint_scale']()}</NativeSelect.Option></NativeSelect.Root></label><label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.vertical']()}</span><NativeSelect.Root value={selected.constraintVertical} onchange={(event: Event) => void updateSelected({ constraintVertical: (event.currentTarget as HTMLSelectElement).value as DesignElement['constraintVertical'] })}><NativeSelect.Option value="top">{m['design.align_top']()}</NativeSelect.Option><NativeSelect.Option value="bottom">{m['design.align_bottom']()}</NativeSelect.Option><NativeSelect.Option value="top-bottom">{m['design.constraint_top_bottom']()}</NativeSelect.Option><NativeSelect.Option value="center">{m['design.align_center']()}</NativeSelect.Option><NativeSelect.Option value="scale">{m['design.constraint_scale']()}</NativeSelect.Option></NativeSelect.Root></label></div></section>{/if}
          <div class="flex items-center gap-1 border-t border-[var(--app-border)] pt-3"><Button variant="outline" size="icon-sm" aria-label={m['design.move_down']()} onclick={() => void reorder(-1)}><ArrowDown /></Button><Button variant="outline" size="icon-sm" aria-label={m['design.move_up']()} onclick={() => void reorder(1)}><ArrowUp /></Button><div class="flex-1"></div><Button variant="destructive" size="icon-sm" disabled={selected.locked} aria-label={m['design.delete']()} onclick={() => void removeSelected()}><Trash2 /></Button></div>
        </div>
      {:else if selectedElements.length > 1}
        <div class="space-y-3 p-3"><p class="text-xs font-medium">{m['design.multiple_selection']({ count: String(selectedElements.length) })}</p><p class="text-[10px] leading-4 text-[var(--app-text-muted)]">{m['design.alignment']()} · {m['design.boolean']()} · {m['design.mask']()}</p><Button variant="destructive" size="sm" class="w-full" onclick={() => void removeSelected()}><Trash2 size={13} />{m['design.delete']()}</Button></div>
      {:else}
        <div class="space-y-4 p-3"><p class="text-xs leading-5 text-[var(--app-text-muted)]">{m['design.no_selection']()}</p>{#if document?.guides.length}<section class="space-y-2"><h3 class="text-[11px] font-semibold">{m['design.rulers']()}</h3>{#each document.guides as guide}<div class="flex items-center gap-2"><span class="w-4 text-[10px] font-semibold uppercase text-[var(--app-text-muted)]">{guide.axis}</span><Input class="h-7 flex-1" type="number" value={guide.position} onchange={(event: Event) => void apply([{ kind: 'update-guide', guideId: guide.id, position: number(event) }], m['design.operation_guide'](), { inverse: [{ kind: 'update-guide', guideId: guide.id, position: guide.position }] })} /><Button variant="ghost" size="icon-sm" class="size-7" aria-label={m['design.remove_guide']()} onclick={() => void removeGuide(guide.id)}><Trash2 size={11} /></Button></div>{/each}</section>{/if}</div>
      {/if}
    </aside>
  </div>
</div>
