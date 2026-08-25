import { describe, expect, it } from 'vitest';
import {
  clampPortalViewportDimension,
  findPortalDevicePreset,
  PORTAL_DEVICE_PRESETS,
  swapPortalViewportOrientation,
} from '$lib/components/agent-room/canvas/portal-device-presets.js';

describe('portal-device-presets', () => {
  it('every preset has a unique id and positive portrait dimensions', () => {
    const ids = PORTAL_DEVICE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of PORTAL_DEVICE_PRESETS) {
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it('finds a preset by id and returns undefined for an unknown one', () => {
    expect(findPortalDevicePreset('iphone-14')).toMatchObject({ width: 390, height: 844 });
    expect(findPortalDevicePreset('nope')).toBeUndefined();
  });

  it('clamps dimensions to the supported range and rounds fractional values', () => {
    expect(clampPortalViewportDimension(100)).toBe(240);
    expect(clampPortalViewportDimension(9000)).toBe(4000);
    expect(clampPortalViewportDimension(500.6)).toBe(501);
    expect(clampPortalViewportDimension(Number.NaN)).toBe(240);
  });

  it('swaps width and height for orientation toggle', () => {
    expect(swapPortalViewportOrientation({ width: 390, height: 844, presetId: 'iphone-14' })).toEqual({ width: 844, height: 390, presetId: 'iphone-14' });
  });
});
