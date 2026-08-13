<script lang="ts">
  import type { NodeProps } from '@xyflow/svelte';
  import { Smartphone, X } from '@lucide/svelte';
  import DeviceWorkbenchPanel from '../DeviceWorkbenchPanel.svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';
  import NodeShell, { type NodeConnection } from './NodeShell.svelte';
  import * as m from '$lib/paraglide/messages.js';

  export type DeviceNodeData = {
    title: string;
    workspaceId: string;
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    connections?: NodeConnection[];
    onJumpToNode?: (nodeId: string) => void;
    onRemoveConnection?: (edgeId: string) => void;
    onRename?: (id: string, title: string) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: DeviceNodeData }>();
</script>

<NodeShell
  {id}
  {selected}
  accent="var(--app-secondary)"
  minWidth={440}
  minHeight={560}
  onResize={data.onResize}
  connections={data.connections ?? []}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
  titleText={data.title}
  onRename={data.onRename}
  class="canvas-device"
>
  {#snippet icon()}<Smartphone size={14} />{/snippet}
  {#snippet title()}{data.title}{/snippet}
  {#snippet actions()}
    <HeaderIconButton label={m['settings.delete']()} class="node-action-btn danger" side="left" onclick={() => data.onDelete(id)}>
      <X size={12} />
    </HeaderIconButton>
  {/snippet}

  <div class="nodrag nowheel h-full min-h-0">
    <DeviceWorkbenchPanel workspaceId={data.workspaceId} />
  </div>
</NodeShell>
