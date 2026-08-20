type ElementLike = Element & {
  parentElement?: Element | null;
};

export function eventTargetElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== 'object') return null;

  const candidate = target as Partial<ElementLike>;
  if (typeof candidate.closest === 'function') return candidate as Element;

  const parent = candidate.parentElement;
  return parent && typeof parent.closest === 'function' ? parent : null;
}

export function eventTargetMatches(target: EventTarget | null, selector: string): boolean {
  return (eventTargetElement(target)?.closest(selector) ?? null) !== null;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return eventTargetMatches(target, 'input, textarea, [contenteditable="true"], .cm-editor');
}
