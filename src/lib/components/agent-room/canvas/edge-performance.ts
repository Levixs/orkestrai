export type EdgePerformanceMode = 'physics' | 'curve' | 'line';

export type EdgePerformanceProfile = {
  mode: EdgePerformanceMode;
  segments: number;
  iterations: number;
  fps: number;
  animateActivity: boolean;
};

export type EdgeAnchors = { ax: number; ay: number; bx: number; by: number };
export type FlowViewport = { x: number; y: number; zoom: number };

export function edgeIntersectsViewport(
  anchors: EdgeAnchors,
  viewport: FlowViewport,
  width: number,
  height: number,
  margin = 180,
): boolean {
  if (width <= 0 || height <= 0 || viewport.zoom <= 0) return true;
  const left = Math.min(anchors.ax, anchors.bx) * viewport.zoom + viewport.x;
  const right = Math.max(anchors.ax, anchors.bx) * viewport.zoom + viewport.x;
  const top = Math.min(anchors.ay, anchors.by) * viewport.zoom + viewport.y;
  const bottom = Math.max(anchors.ay, anchors.by) * viewport.zoom + viewport.y;
  return right >= -margin && left <= width + margin && bottom >= -margin && top <= height + margin;
}

export function edgePerformanceProfile(input: {
  edgeCount: number;
  documentVisible: boolean;
  inViewport: boolean;
  reducedMotion: boolean;
  emphasized: boolean;
}): EdgePerformanceProfile {
  if (!input.documentVisible || !input.inViewport) {
    return { mode: 'line', segments: 0, iterations: 0, fps: 0, animateActivity: false };
  }
  if (input.reducedMotion) {
    return { mode: 'curve', segments: 0, iterations: 0, fps: 0, animateActivity: false };
  }
  if (input.edgeCount <= 80) {
    return { mode: 'physics', segments: 14, iterations: 5, fps: 60, animateActivity: input.emphasized };
  }
  if (input.edgeCount <= 160) {
    return input.emphasized
      ? { mode: 'physics', segments: 10, iterations: 3, fps: 45, animateActivity: true }
      : { mode: 'physics', segments: 8, iterations: 2, fps: 30, animateActivity: false };
  }
  if (input.edgeCount <= 350) {
    return input.emphasized
      ? { mode: 'physics', segments: 8, iterations: 2, fps: 30, animateActivity: true }
      : { mode: 'curve', segments: 0, iterations: 0, fps: 0, animateActivity: false };
  }
  return input.emphasized
    ? { mode: 'curve', segments: 0, iterations: 0, fps: 0, animateActivity: true }
    : { mode: 'line', segments: 0, iterations: 0, fps: 0, animateActivity: false };
}

export function staticEdgePath(anchors: EdgeAnchors, mode: Exclude<EdgePerformanceMode, 'physics'>) {
  const midX = (anchors.ax + anchors.bx) / 2;
  const midY = (anchors.ay + anchors.by) / 2;
  if (mode === 'line') return { path: `M ${anchors.ax},${anchors.ay} L ${anchors.bx},${anchors.by}`, midX, midY };
  const distance = Math.hypot(anchors.bx - anchors.ax, anchors.by - anchors.ay);
  const sag = Math.min(42, Math.max(12, distance * 0.06));
  return {
    path: `M ${anchors.ax},${anchors.ay} Q ${midX},${midY + sag} ${anchors.bx},${anchors.by}`,
    midX,
    midY: midY + sag / 2,
  };
}
