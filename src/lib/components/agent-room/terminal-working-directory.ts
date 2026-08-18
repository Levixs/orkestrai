export function workingDirectoryFromOsc(payload: string, windows = false): string | null {
  try {
    const url = new URL(payload);
    if (url.protocol !== 'file:') return null;
    let path = decodeURIComponent(url.pathname);
    if (windows && /^\/[a-zA-Z]:\//.test(path)) path = path.slice(1);
    return path || null;
  } catch {
    return null;
  }
}
