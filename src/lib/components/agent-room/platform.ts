/** true no macOS (ambiente sem `navigator`, ex.: SSR, retorna false). */
export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
}
