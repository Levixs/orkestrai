<script lang="ts">
  import {
    BitmapVideoFrameRenderer,
    WebCodecsVideoDecoder,
    WebGLVideoFrameRenderer,
  } from '@yume-chan/scrcpy-decoder-webcodecs';
  import { readAndroidDeviceStream } from './android-device-stream.js';

  let {
    streamUrl,
    alt,
    style,
    onloaded,
    onerror,
    onpointerdown,
    onpointerup,
    onpointercancel,
  }: {
    streamUrl: string;
    alt: string;
    style?: string;
    onloaded: (width: number, height: number) => void;
    onerror: () => void;
    onpointerdown: (event: PointerEvent) => void;
    onpointerup: (event: PointerEvent) => void;
    onpointercancel: (event: PointerEvent) => void;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  $effect(() => {
    const target = canvas;
    const url = streamUrl;
    if (!target || !url) return;
    const abort = new AbortController();
    let decoder: WebCodecsVideoDecoder | null = null;
    let removeSizeListener: (() => void) | null = null;

    void (async () => {
      try {
        if (!WebCodecsVideoDecoder.isSupported) throw new Error('WebCodecs is unavailable.');
        const response = await fetch(url, { signal: abort.signal, cache: 'no-store' });
        if (!response.ok || !response.body) throw new Error(`Android stream failed with HTTP ${response.status}.`);
        const { header, stream } = await readAndroidDeviceStream(response.body);
        if (header.width && header.height) {
          target.width = header.width;
          target.height = header.height;
        }
        const renderer = WebGLVideoFrameRenderer.isSupported
          ? new WebGLVideoFrameRenderer(target)
          : new BitmapVideoFrameRenderer(target);
        decoder = new WebCodecsVideoDecoder({ codec: header.codec, renderer });
        removeSizeListener = decoder.sizeChanged(({ width, height }) => onloaded(width, height));
        await stream.pipeTo(decoder.writable);
        if (!abort.signal.aborted) onerror();
      } catch {
        if (!abort.signal.aborted) onerror();
      }
    })();

    return () => {
      abort.abort();
      removeSizeListener?.();
      decoder?.dispose();
    };
  });
</script>

<canvas
  bind:this={canvas}
  aria-label={alt}
  class="block max-h-none max-w-none touch-none select-none rounded-[18px] object-contain"
  {style}
  onpointerdown={onpointerdown}
  onpointerup={onpointerup}
  onpointercancel={onpointercancel}
></canvas>
