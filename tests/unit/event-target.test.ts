import { describe, expect, it, vi } from 'vitest';
import { eventTargetElement, eventTargetMatches, isTypingTarget } from '$lib/components/agent-room/event-target.js';

function targetWithClosest(match: boolean): EventTarget {
  return {
    closest: vi.fn(() => (match ? {} : null)),
  } as unknown as EventTarget;
}

describe('event target guards', () => {
  it('ignores Window-like and other non-element event targets', () => {
    const target = {} as EventTarget;

    expect(eventTargetElement(target)).toBeNull();
    expect(eventTargetMatches(target, 'input')).toBe(false);
    expect(isTypingTarget(target)).toBe(false);
  });

  it('uses an element target without assuming HTMLElement', () => {
    const target = targetWithClosest(true);

    expect(eventTargetElement(target)).toBe(target);
    expect(eventTargetMatches(target, '.cm-editor')).toBe(true);
    expect(isTypingTarget(target)).toBe(true);
  });

  it('uses the parent element when an event targets a text node', () => {
    const parent = targetWithClosest(true);
    const textTarget = { parentElement: parent } as unknown as EventTarget;

    expect(eventTargetElement(textTarget)).toBe(parent);
    expect(isTypingTarget(textTarget)).toBe(true);
  });
});
