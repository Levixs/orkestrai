import type {
  DesignDocument,
  DesignElement,
  DesignMotionEasing,
  DesignMotionKeyframeValues,
  DesignMotionTrack,
  DesignPrototypeFlow,
} from "../contracts/schemas/designSchemas.js";

type MotionValueKey = keyof DesignMotionKeyframeValues;

export function prototypeFrames(document: DesignDocument): DesignElement[] {
  return document.elements
    .filter(
      (element) =>
        element.type === "frame" && !element.parentId && element.visible,
    )
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
}

export function defaultPrototypeFlow(
  document: DesignDocument,
): DesignPrototypeFlow | null {
  return (
    document.prototypeFlows.find(
      (flow) => flow.id === document.presentation.defaultFlowId,
    ) ??
    [...document.prototypeFlows].sort(
      (left, right) => left.order - right.order,
    )[0] ??
    null
  );
}

export function designDescendantIds(
  document: DesignDocument,
  rootId: string,
): Set<string> {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of document.elements) {
      if (
        element.parentId &&
        ids.has(element.parentId) &&
        !ids.has(element.id)
      ) {
        ids.add(element.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function prototypeFrameElements(
  document: DesignDocument,
  frameId: string,
): DesignElement[] {
  const ids = designDescendantIds(document, frameId);
  return document.elements.filter((element) => ids.has(element.id));
}

export function prototypeFrameForElement(
  document: DesignDocument,
  elementId: string,
): DesignElement | null {
  const elements = new Map(
    document.elements.map((element) => [element.id, element]),
  );
  let current = elements.get(elementId) ?? null;
  while (current) {
    if (current.type === "frame" && !current.parentId) return current;
    current = current.parentId
      ? (elements.get(current.parentId) ?? null)
      : null;
  }
  return null;
}

export function easingToCss(easing: DesignMotionEasing): string {
  if (easing.type === "preset") return easing.value;
  if (easing.type === "cubic-bezier")
    return `cubic-bezier(${easing.x1}, ${easing.y1}, ${easing.x2}, ${easing.y2})`;
  const duration = Math.max(
    0.1,
    Math.min(2, (1 / Math.sqrt(easing.stiffness / easing.mass)) * 12),
  );
  return `linear(0, ${Math.min(1.08, 1 + easing.velocity / 100).toFixed(3)} 45%, 1 ${(duration * 70).toFixed(1)}%, 1)`;
}

function cubicBezierY(
  easing: Extract<DesignMotionEasing, { type: "cubic-bezier" }>,
  progress: number,
): number {
  const inverse = 1 - progress;
  return (
    3 * inverse * inverse * progress * easing.y1 +
    3 * inverse * progress * progress * easing.y2 +
    progress * progress * progress
  );
}

export function easedProgress(
  easing: DesignMotionEasing,
  progress: number,
): number {
  const value = Math.max(0, Math.min(1, progress));
  if (easing.type === "cubic-bezier")
    return Math.max(0, Math.min(1, cubicBezierY(easing, value)));
  if (easing.type === "spring") {
    const angular = Math.sqrt(easing.stiffness / easing.mass);
    const damping =
      easing.damping / (2 * Math.sqrt(easing.stiffness * easing.mass));
    const decay = Math.exp(-damping * angular * value * 6);
    return Math.max(
      0,
      Math.min(
        1,
        1 - decay * Math.cos(angular * value * 0.35 + easing.velocity * 0.01),
      ),
    );
  }
  if (easing.value === "linear") return value;
  if (easing.value === "ease-in") return value * value;
  if (easing.value === "ease-out") return 1 - (1 - value) * (1 - value);
  if (easing.value === "ease-in-out")
    return value < 0.5
      ? 2 * value * value
      : 1 - Math.pow(-2 * value + 2, 2) / 2;
  return 1 - Math.pow(1 - value, 3);
}

function colorChannels(color: string): [number, number, number, number] | null {
  const raw = color.slice(1);
  const expanded =
    raw.length === 3 || raw.length === 4
      ? raw
          .split("")
          .map((value) => value + value)
          .join("")
      : raw;
  if (expanded.length !== 6 && expanded.length !== 8) return null;
  const channels = expanded
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16));
  return channels && channels.length >= 3
    ? [channels[0], channels[1], channels[2], channels[3] ?? 255]
    : null;
}

function interpolateColor(from: string, to: string, progress: number): string {
  const left = colorChannels(from);
  const right = colorChannels(to);
  if (!left || !right) return progress < 0.5 ? from : to;
  const channels = left.map((value, index) =>
    Math.round(value + (right[index] - value) * progress),
  );
  const hex = channels
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `#${channels[3] === 255 ? hex.slice(0, 6) : hex}`;
}

function baseValue(
  element: DesignElement,
  key: MotionValueKey,
): number | string {
  if (key === "fill")
    return (
      element.fills.find((paint) => paint.type === "solid")?.color ??
      element.fill
    );
  return element[key];
}

function keyframeValue(
  element: DesignElement,
  track: DesignMotionTrack,
  keyframeIndex: number,
  key: MotionValueKey,
): number | string {
  for (let index = keyframeIndex; index >= 0; index -= 1) {
    const value = track.keyframes[index]?.values[key];
    if (value !== undefined) return value;
  }
  return baseValue(element, key);
}

function effectiveTrack(
  document: DesignDocument,
  track: DesignMotionTrack,
): DesignMotionTrack {
  const token = track.tokenId
    ? document.motionTokens.find((candidate) => candidate.id === track.tokenId)
    : null;
  return token
    ? { ...track, durationMs: token.durationMs, easing: token.easing }
    : track;
}

export function motionTrackValues(
  document: DesignDocument,
  sourceTrack: DesignMotionTrack,
  element: DesignElement,
  elapsedMs: number,
): DesignMotionKeyframeValues | null {
  const track = effectiveTrack(document, sourceTrack);
  const localElapsed = elapsedMs - track.delayMs;
  const totalDuration = track.durationMs * track.iterations;
  if (localElapsed < 0)
    return track.fillMode === "both"
      ? structuredClone(track.keyframes[0].values)
      : null;
  if (localElapsed >= totalDuration && track.fillMode === "none") return null;
  const bounded = Math.max(
    0,
    Math.min(localElapsed, Math.max(0, totalDuration - 0.001)),
  );
  const iteration = Math.min(
    track.iterations - 1,
    Math.floor(bounded / track.durationMs),
  );
  let time = bounded - iteration * track.durationMs;
  const reversed =
    track.direction === "reverse" ||
    (track.direction === "alternate" && iteration % 2 === 1);
  if (reversed) time = track.durationMs - time;
  if (localElapsed >= totalDuration) time = reversed ? 0 : track.durationMs;
  const keyframes = [...track.keyframes].sort(
    (left, right) => left.timeMs - right.timeMs,
  );
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.timeMs >= time);
  const toIndex = rightIndex < 0 ? keyframes.length - 1 : rightIndex;
  const fromIndex = Math.max(
    0,
    toIndex - (keyframes[toIndex].timeMs === time ? 0 : 1),
  );
  const from = keyframes[fromIndex];
  const to = keyframes[toIndex];
  const span = Math.max(1, to.timeMs - from.timeMs);
  const progress = easedProgress(
    track.easing,
    from === to ? 1 : (time - from.timeMs) / span,
  );
  const keys = new Set<MotionValueKey>();
  for (let index = 0; index <= toIndex; index += 1) {
    for (const key of Object.keys(keyframes[index].values) as MotionValueKey[])
      keys.add(key);
  }
  const values: DesignMotionKeyframeValues = {};
  for (const key of keys) {
    const left = keyframeValue(
      element,
      { ...track, keyframes },
      fromIndex,
      key,
    );
    const right = keyframeValue(element, { ...track, keyframes }, toIndex, key);
    if (key === "fill")
      values.fill = interpolateColor(String(left), String(right), progress);
    else
      (values as Record<string, number>)[key] =
        Number(left) + (Number(right) - Number(left)) * progress;
  }
  return values;
}

export function applyMotionTracks(
  document: DesignDocument,
  elements: DesignElement[],
  elapsedMs: number,
): DesignElement[] {
  const tracks = new Map<string, DesignMotionTrack[]>();
  for (const track of document.motionTracks)
    tracks.set(track.elementId, [
      ...(tracks.get(track.elementId) ?? []),
      track,
    ]);
  return elements.map((element) => {
    const candidates = tracks.get(element.id);
    if (!candidates?.length) return element;
    const changes: DesignMotionKeyframeValues = {};
    for (const track of candidates.sort(
      (left, right) => left.order - right.order,
    )) {
      Object.assign(
        changes,
        motionTrackValues(
          document,
          track,
          { ...element, ...changes },
          elapsedMs,
        ) ?? {},
      );
    }
    if (changes.fill) {
      const fills = element.fills.length
        ? element.fills.map((paint, index) =>
            index === 0 && paint.type === "solid"
              ? { ...paint, color: changes.fill! }
              : paint,
          )
        : element.fills;
      return { ...element, ...changes, fill: changes.fill, fills };
    }
    return { ...element, ...changes };
  });
}

function cssKeyframeValues(
  element: DesignElement,
  values: DesignMotionKeyframeValues,
): string[] {
  const rules: string[] = [];
  const x = values.x === undefined ? 0 : values.x - element.x;
  const y = values.y === undefined ? 0 : values.y - element.y;
  const rotation = values.rotation ?? element.rotation;
  const scaleX = values.width === undefined ? 1 : values.width / element.width;
  const scaleY =
    values.height === undefined ? 1 : values.height / element.height;
  if (x || y || rotation !== element.rotation || scaleX !== 1 || scaleY !== 1) {
    rules.push(
      `transform: translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`,
    );
  }
  if (values.opacity !== undefined) rules.push(`opacity: ${values.opacity}`);
  if (values.cornerRadius !== undefined)
    rules.push(`border-radius: ${values.cornerRadius}px`);
  if (values.fill !== undefined) rules.push(`background-color: ${values.fill}`);
  return rules;
}

export function exportMotionCss(
  document: DesignDocument,
  trackIds?: string[],
): string {
  const selected = new Set(
    trackIds ?? document.motionTracks.map((track) => track.id),
  );
  const blocks: string[] = [];
  for (const sourceTrack of document.motionTracks.filter((track) =>
    selected.has(track.id),
  )) {
    const element = document.elements.find(
      (candidate) => candidate.id === sourceTrack.elementId,
    );
    if (!element) continue;
    const track = effectiveTrack(document, sourceTrack);
    const name = `orkestrai-${track.id.replace(/-/g, "").slice(0, 16)}`;
    const keyframes = [...track.keyframes].sort(
      (left, right) => left.timeMs - right.timeMs,
    );
    blocks.push(`@keyframes ${name} {`);
    for (const keyframe of keyframes) {
      const percentage = Math.max(
        0,
        Math.min(100, (keyframe.timeMs / track.durationMs) * 100),
      );
      blocks.push(
        `  ${Number(percentage.toFixed(3))}% { ${cssKeyframeValues(element, keyframe.values).join("; ")} }`,
      );
    }
    blocks.push("}");
    blocks.push(`[data-design-element="${element.id}"] {`);
    blocks.push(
      `  animation: ${name} ${track.durationMs}ms ${easingToCss(track.easing)} ${track.delayMs}ms ${track.iterations} ${track.direction} ${track.fillMode};`,
    );
    blocks.push("}");
  }
  return `${blocks.join("\n")}\n`;
}

export function exportMotionDev(
  document: DesignDocument,
  trackIds?: string[],
): string {
  const selected = new Set(
    trackIds ?? document.motionTracks.map((track) => track.id),
  );
  const lines = [`import { animate } from 'motion';`, ""];
  for (const sourceTrack of document.motionTracks.filter((track) =>
    selected.has(track.id),
  )) {
    const element = document.elements.find(
      (candidate) => candidate.id === sourceTrack.elementId,
    );
    if (!element) continue;
    const track = effectiveTrack(document, sourceTrack);
    const keyframes = [...track.keyframes].sort(
      (left, right) => left.timeMs - right.timeMs,
    );
    const keys = new Set(
      keyframes.flatMap(
        (keyframe) => Object.keys(keyframe.values) as MotionValueKey[],
      ),
    );
    const values: Record<string, Array<number | string>> = {};
    for (const key of keys)
      values[key] = keyframes.map((_, index) =>
        keyframeValue(element, { ...track, keyframes }, index, key),
      );
    lines.push(
      `animate('[data-design-element="${element.id}"]', ${JSON.stringify(values, null, 2)}, {`,
    );
    lines.push(`  duration: ${track.durationMs / 1_000},`);
    lines.push(`  delay: ${track.delayMs / 1_000},`);
    lines.push(`  ease: ${JSON.stringify(easingToCss(track.easing))},`);
    lines.push(`  repeat: ${Math.max(0, track.iterations - 1)},`);
    lines.push(`  direction: ${JSON.stringify(track.direction)},`);
    lines.push("});", "");
  }
  return `${lines.join("\n").trim()}\n`;
}
