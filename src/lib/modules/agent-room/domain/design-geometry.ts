import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon, Ring } from 'polygon-clipping';
import type { DesignElement, DesignPathPoint } from '../contracts/schemas/designSchemas.js';

export type DesignBooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';

function rotatePoint(point: [number, number], element: DesignElement): [number, number] {
  if (!element.rotation) return point;
  const radians = element.rotation * Math.PI / 180;
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const dx = point[0] - centerX;
  const dy = point[1] - centerY;
  return [
    centerX + dx * Math.cos(radians) - dy * Math.sin(radians),
    centerY + dx * Math.sin(radians) + dy * Math.cos(radians),
  ];
}

function closeRing(ring: Ring): Ring {
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring.at(-1)!;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, [...first] as [number, number]];
}

export function elementPolygon(element: DesignElement): Polygon | null {
  let ring: Ring;
  if (element.type === 'rectangle' || element.type === 'frame' || element.type === 'image' || element.type === 'text') {
    ring = [
      [element.x, element.y],
      [element.x + element.width, element.y],
      [element.x + element.width, element.y + element.height],
      [element.x, element.y + element.height],
    ];
  } else if (element.type === 'ellipse') {
    const count = 48;
    ring = Array.from({ length: count }, (_, index) => {
      const angle = index / count * Math.PI * 2;
      return [
        element.x + element.width / 2 + Math.cos(angle) * element.width / 2,
        element.y + element.height / 2 + Math.sin(angle) * element.height / 2,
      ] as [number, number];
    });
  } else if (element.type === 'path') {
    const source = element.pathSubpaths[0] ?? element.pathPoints;
    if (source.length < 3 || !element.pathClosed) return null;
    ring = source.map((point) => [element.x + point.x, element.y + point.y]);
  } else {
    return null;
  }
  return [closeRing(ring.map((point) => rotatePoint(point, element)))];
}

export function combineDesignElements(
  elements: DesignElement[],
  operation: DesignBooleanOperation,
): { x: number; y: number; width: number; height: number; subpaths: DesignPathPoint[][] } {
  const polygons = elements.map(elementPolygon);
  if (polygons.some((polygon) => !polygon)) throw new Error('Only closed vector layers can be combined.');
  const [first, ...rest] = polygons as Polygon[];
  let result: MultiPolygon;
  if (operation === 'union') result = polygonClipping.union(first, ...rest);
  else if (operation === 'subtract') result = polygonClipping.difference(first, ...rest);
  else if (operation === 'intersect') result = polygonClipping.intersection(first, ...rest);
  else result = polygonClipping.xor(first, ...rest);
  const rings = result.flatMap((polygon) => polygon).filter((ring) => ring.length >= 4);
  if (!rings.length) throw new Error('The boolean operation produced an empty path.');
  const xs = rings.flatMap((ring) => ring.map((point) => point[0]));
  const ys = rings.flatMap((ring) => ring.map((point) => point[1]));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - x);
  const height = Math.max(1, Math.max(...ys) - y);
  return {
    x,
    y,
    width,
    height,
    subpaths: rings.map((ring) => ring.slice(0, -1).map(([pointX, pointY]) => ({
      x: pointX - x,
      y: pointY - y,
      inX: null,
      inY: null,
      outX: null,
      outY: null,
    }))),
  };
}

export function designPathData(element: DesignElement): string {
  const paths = element.pathSubpaths.length ? element.pathSubpaths : element.pathPoints.length ? [element.pathPoints] : [];
  return paths.map((points) => {
    if (!points.length) return '';
    const commands = [`M ${element.x + points[0].x} ${element.y + points[0].y}`];
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      if (previous.outX !== null && previous.outY !== null && point.inX !== null && point.inY !== null) {
        commands.push(`C ${element.x + previous.outX} ${element.y + previous.outY} ${element.x + point.inX} ${element.y + point.inY} ${element.x + point.x} ${element.y + point.y}`);
      } else {
        commands.push(`L ${element.x + point.x} ${element.y + point.y}`);
      }
    }
    if (element.pathClosed && points.length > 1) {
      const last = points.at(-1)!;
      const first = points[0];
      if (last.outX !== null && last.outY !== null && first.inX !== null && first.inY !== null) {
        commands.push(`C ${element.x + last.outX} ${element.y + last.outY} ${element.x + first.inX} ${element.y + first.inY} ${element.x + first.x} ${element.y + first.y}`);
      }
      commands.push('Z');
    }
    return commands.join(' ');
  }).filter(Boolean).join(' ');
}

type Point = { x: number; y: number };

function lerpPoint(from: Point, to: Point, amount: number): Point {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export function designPathSegmentPoint(from: DesignPathPoint, to: DesignPathPoint, amount: number): Point {
  const t = Math.max(0, Math.min(1, amount));
  if (from.outX === null || from.outY === null || to.inX === null || to.inY === null) {
    return lerpPoint(from, to, t);
  }
  const p01 = lerpPoint(from, { x: from.outX, y: from.outY }, t);
  const p12 = lerpPoint({ x: from.outX, y: from.outY }, { x: to.inX, y: to.inY }, t);
  const p23 = lerpPoint({ x: to.inX, y: to.inY }, to, t);
  return lerpPoint(lerpPoint(p01, p12, t), lerpPoint(p12, p23, t), t);
}

export function splitDesignPathSegment(
  points: DesignPathPoint[],
  segmentStartIndex: number,
  amount: number,
  closed: boolean,
): DesignPathPoint[] {
  if (points.length < 2 || segmentStartIndex < 0 || segmentStartIndex >= points.length) return points;
  const nextIndex = (segmentStartIndex + 1) % points.length;
  if (!closed && nextIndex === 0) return points;
  const t = Math.max(0.01, Math.min(0.99, amount));
  const from = points[segmentStartIndex];
  const to = points[nextIndex];
  const curved = from.outX !== null && from.outY !== null && to.inX !== null && to.inY !== null;
  const next = points.map((point) => ({ ...point }));
  let inserted: DesignPathPoint;
  if (curved) {
    const controlFrom = { x: from.outX!, y: from.outY! };
    const controlTo = { x: to.inX!, y: to.inY! };
    const p01 = lerpPoint(from, controlFrom, t);
    const p12 = lerpPoint(controlFrom, controlTo, t);
    const p23 = lerpPoint(controlTo, to, t);
    const p012 = lerpPoint(p01, p12, t);
    const p123 = lerpPoint(p12, p23, t);
    const point = lerpPoint(p012, p123, t);
    next[segmentStartIndex].outX = p01.x;
    next[segmentStartIndex].outY = p01.y;
    next[nextIndex].inX = p23.x;
    next[nextIndex].inY = p23.y;
    inserted = { ...point, inX: p012.x, inY: p012.y, outX: p123.x, outY: p123.y };
  } else {
    inserted = { ...lerpPoint(from, to, t), inX: null, inY: null, outX: null, outY: null };
  }
  if (nextIndex === 0) next.push(inserted);
  else next.splice(nextIndex, 0, inserted);
  return next;
}

export function cornerDesignPathPoint(points: DesignPathPoint[], index: number): DesignPathPoint[] {
  return points.map((point, pointIndex) => pointIndex === index
    ? { ...point, inX: null, inY: null, outX: null, outY: null }
    : point);
}

export function smoothDesignPathPoint(points: DesignPathPoint[], index: number, closed: boolean): DesignPathPoint[] {
  const point = points[index];
  if (!point || points.length < 2) return points;
  const previous = index > 0 ? points[index - 1] : closed ? points.at(-1)! : point;
  const following = index < points.length - 1 ? points[index + 1] : closed ? points[0] : point;
  const dx = following.x - previous.x;
  const dy = following.y - previous.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const unitX = dx / magnitude;
  const unitY = dy / magnitude;
  const incomingLength = previous === point ? Math.hypot(following.x - point.x, following.y - point.y) / 3 : Math.hypot(point.x - previous.x, point.y - previous.y) / 3;
  const outgoingLength = following === point ? Math.hypot(point.x - previous.x, point.y - previous.y) / 3 : Math.hypot(following.x - point.x, following.y - point.y) / 3;
  return points.map((candidate, pointIndex) => pointIndex === index
    ? {
        ...candidate,
        inX: candidate.x - unitX * incomingLength,
        inY: candidate.y - unitY * incomingLength,
        outX: candidate.x + unitX * outgoingLength,
        outY: candidate.y + unitY * outgoingLength,
      }
    : candidate);
}

export function autoLayoutChanges(frame: DesignElement, children: DesignElement[]): Map<string, Partial<DesignElement>> {
  const changes = new Map<string, Partial<DesignElement>>();
  if (frame.layoutMode === 'none' || !children.length) return changes;
  const ordered = [...children].sort((a, b) => a.order - b.order);
  const left = frame.x + frame.layoutPaddingLeft;
  const top = frame.y + frame.layoutPaddingTop;
  const availableWidth = Math.max(1, frame.width - frame.layoutPaddingLeft - frame.layoutPaddingRight);
  if (frame.layoutMode === 'grid') {
    const columns = Math.max(1, Math.min(frame.layoutGridColumns, ordered.length));
    const cellWidth = Math.max(1, (availableWidth - frame.layoutColumnGap * (columns - 1)) / columns);
    let rowY = top;
    for (let index = 0; index < ordered.length; index += columns) {
      const row = ordered.slice(index, index + columns);
      const rowHeight = Math.max(...row.map((child) => child.height));
      row.forEach((child, column) => changes.set(child.id, {
        x: left + column * (cellWidth + frame.layoutColumnGap),
        y: rowY,
        width: cellWidth,
      }));
      rowY += rowHeight + frame.layoutRowGap;
    }
    return changes;
  }
  if (frame.layoutMode === 'vertical') {
    let y = top;
    for (const child of ordered) {
      changes.set(child.id, { x: left, y });
      y += child.height + frame.layoutGap;
    }
    return changes;
  }
  let x = left;
  let y = top;
  let rowHeight = 0;
  for (const child of ordered) {
    if (frame.layoutWrap && x > left && x + child.width > left + availableWidth) {
      x = left;
      y += rowHeight + frame.layoutRowGap;
      rowHeight = 0;
    }
    changes.set(child.id, { x, y });
    x += child.width + frame.layoutGap;
    rowHeight = Math.max(rowHeight, child.height);
  }
  return changes;
}

export function constrainedChildChanges(
  child: DesignElement,
  frame: DesignElement,
  nextFrame: Pick<DesignElement, 'x' | 'y' | 'width' | 'height'>,
): Partial<DesignElement> {
  const widthRatio = nextFrame.width / frame.width;
  const heightRatio = nextFrame.height / frame.height;
  const left = child.x - frame.x;
  const right = frame.width - left - child.width;
  const top = child.y - frame.y;
  const bottom = frame.height - top - child.height;
  const changes: Partial<DesignElement> = {};
  if (child.constraintHorizontal === 'right') changes.x = nextFrame.x + nextFrame.width - right - child.width;
  else if (child.constraintHorizontal === 'left-right') {
    changes.x = nextFrame.x + left;
    changes.width = Math.max(1, nextFrame.width - left - right);
  } else if (child.constraintHorizontal === 'center') changes.x = nextFrame.x + nextFrame.width / 2 - (frame.width / 2 - left);
  else if (child.constraintHorizontal === 'scale') {
    changes.x = nextFrame.x + left * widthRatio;
    changes.width = Math.max(1, child.width * widthRatio);
  } else changes.x = nextFrame.x + left;
  if (child.constraintVertical === 'bottom') changes.y = nextFrame.y + nextFrame.height - bottom - child.height;
  else if (child.constraintVertical === 'top-bottom') {
    changes.y = nextFrame.y + top;
    changes.height = Math.max(1, nextFrame.height - top - bottom);
  } else if (child.constraintVertical === 'center') changes.y = nextFrame.y + nextFrame.height / 2 - (frame.height / 2 - top);
  else if (child.constraintVertical === 'scale') {
    changes.y = nextFrame.y + top * heightRatio;
    changes.height = Math.max(1, child.height * heightRatio);
  } else changes.y = nextFrame.y + top;
  return changes;
}
