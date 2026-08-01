<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte';

  type ZoomApi = {
    setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void;
    fitView: (options?: { duration?: number }) => void;
    screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
    getViewport: () => { x: number; y: number; zoom: number };
  };

  let { onReady }: { onReady: (api: ZoomApi) => void } = $props();

  const { setCenter, fitView, screenToFlowPosition, getViewport } = useSvelteFlow();

  $effect(() => {
    onReady({
      setCenter: (x, y, options) => setCenter(x, y, options),
      fitView: (options) => fitView(options),
      screenToFlowPosition: (position) => screenToFlowPosition(position),
      getViewport: () => getViewport(),
    });
  });
</script>
