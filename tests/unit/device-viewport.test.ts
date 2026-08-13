import { describe, expect, it } from 'vitest';
import {
  fitDeviceViewportScale,
  stepDeviceViewportScale,
} from '../../src/lib/components/agent-room/device-viewport.js';

describe('device viewport', () => {
  it('fits the complete screen inside the available pane without upscaling', () => {
    expect(fitDeviceViewportScale({
      contentWidth: 400,
      contentHeight: 860,
      viewportWidth: 600,
      viewportHeight: 700,
    })).toBeCloseTo(620 / 860);

    expect(fitDeviceViewportScale({
      contentWidth: 320,
      contentHeight: 600,
      viewportWidth: 1_200,
      viewportHeight: 900,
    })).toBe(1);
  });

  it('steps from a computed fit scale through stable zoom levels', () => {
    expect(stepDeviceViewportScale(0.61, 1)).toBe(0.67);
    expect(stepDeviceViewportScale(0.61, -1)).toBe(0.5);
    expect(stepDeviceViewportScale(2, 1)).toBe(2);
    expect(stepDeviceViewportScale(0.25, -1)).toBe(0.25);
  });
});
