import { describe, expect, it } from 'vitest';
import { usageSeverity } from '$lib/modules/agent-room/domain/usage.js';

describe('usageSeverity', () => {
  it('usa as mesmas faixas verde, amarela e vermelha em todas as views', () => {
    expect(usageSeverity(0)).toBe('normal');
    expect(usageSeverity(59)).toBe('normal');
    expect(usageSeverity(60)).toBe('warning');
    expect(usageSeverity(84)).toBe('warning');
    expect(usageSeverity(85)).toBe('danger');
    expect(usageSeverity(100)).toBe('danger');
  });
});
