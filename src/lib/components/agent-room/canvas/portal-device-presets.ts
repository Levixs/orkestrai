export type PortalViewport = { width: number; height: number };

export type PortalDevicePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

/** Larguras/alturas reais dos dispositivos mais comuns, em CSS px (portrait). */
export const PORTAL_DEVICE_PRESETS: PortalDevicePreset[] = [
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
  { id: 'iphone-14', label: 'iPhone 14', width: 390, height: 844 },
  { id: 'iphone-14-pro-max', label: 'iPhone 14 Pro Max', width: 430, height: 932 },
  { id: 'pixel-7', label: 'Pixel 7', width: 412, height: 915 },
  { id: 'galaxy-s20', label: 'Galaxy S20 Ultra', width: 412, height: 915 },
  { id: 'ipad-mini', label: 'iPad Mini', width: 768, height: 1024 },
  { id: 'ipad-pro', label: 'iPad Pro 12.9"', width: 1024, height: 1366 },
  { id: 'laptop', label: 'Laptop', width: 1366, height: 768 },
  { id: 'desktop', label: 'Desktop', width: 1920, height: 1080 },
];

export const PORTAL_VIEWPORT_MIN = 240;
export const PORTAL_VIEWPORT_MAX = 4000;

export function findPortalDevicePreset(id: string): PortalDevicePreset | undefined {
  return PORTAL_DEVICE_PRESETS.find((preset) => preset.id === id);
}

export function clampPortalViewportDimension(value: number): number {
  if (!Number.isFinite(value)) return PORTAL_VIEWPORT_MIN;
  return Math.min(PORTAL_VIEWPORT_MAX, Math.max(PORTAL_VIEWPORT_MIN, Math.round(value)));
}

export function swapPortalViewportOrientation(viewport: PortalViewport): PortalViewport {
  return { width: viewport.height, height: viewport.width };
}
