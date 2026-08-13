<script lang="ts">
  import AutomationWorkspace from '$lib/components/agent-room/AutomationWorkspace.svelte';
  import type { Workspace } from '$lib/modules/agent-room/domain/types.js';

  let { workspace, terminals, onClose }: {
    workspace: Workspace;
    terminals: Array<{ id: string; title: string }>;
    onClose: () => void;
    api?: unknown;
  } = $props();
</script>

<AutomationWorkspace workspaceId={workspace.id} {terminals} compact {onClose} />
