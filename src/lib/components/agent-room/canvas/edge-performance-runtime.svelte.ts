let references = 0;
let cleanup: (() => void) | null = null;
let state = $state({
  documentVisible: true,
  reducedMotion: false,
  width: 0,
  height: 0,
});

export const canvasEdgeRuntime = {
  get current() {
    return state;
  },
};

export function retainCanvasEdgeRuntime(): () => void {
  references += 1;
  if (typeof window !== 'undefined' && !cleanup) {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      state = {
        documentVisible: document.visibilityState !== 'hidden',
        reducedMotion: media.matches,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', sync);
    media.addEventListener('change', sync);
    cleanup = () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('resize', sync);
      media.removeEventListener('change', sync);
    };
  }
  return () => {
    references = Math.max(0, references - 1);
    if (references === 0 && cleanup) {
      cleanup();
      cleanup = null;
    }
  };
}
