export const DEVICE_ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2] as const;

type FitDeviceViewportInput = {
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  horizontalPadding?: number;
  verticalPadding?: number;
};

export function fitDeviceViewportScale({
  contentWidth,
  contentHeight,
  viewportWidth,
  viewportHeight,
  horizontalPadding = 36,
  verticalPadding = 80,
}: FitDeviceViewportInput): number {
  if (contentWidth <= 0 || contentHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return 1;
  const availableWidth = Math.max(1, viewportWidth - horizontalPadding);
  const availableHeight = Math.max(1, viewportHeight - verticalPadding);
  return Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
}

export function stepDeviceViewportScale(current: number, direction: -1 | 1): number {
  const epsilon = 0.005;
  if (direction > 0) {
    return DEVICE_ZOOM_STEPS.find((step) => step > current + epsilon) ?? DEVICE_ZOOM_STEPS.at(-1)!;
  }
  return [...DEVICE_ZOOM_STEPS].reverse().find((step) => step < current - epsilon) ?? DEVICE_ZOOM_STEPS[0];
}
