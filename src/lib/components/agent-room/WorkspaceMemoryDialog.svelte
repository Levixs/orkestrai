<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import WorkspaceMemoryView from './WorkspaceMemoryView.svelte';
  import * as m from '$lib/paraglide/messages.js';

  let { open = $bindable(false), workspaceId }: { open?: boolean; workspaceId: string } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="h-[min(820px,88vh)] max-w-[min(1120px,94vw)] overflow-hidden p-0" showCloseButton={false}>
    <Dialog.Title class="sr-only">{m['memory.title']()}</Dialog.Title>
    <WorkspaceMemoryView {workspaceId} compact />
  </Dialog.Content>
</Dialog.Root>
