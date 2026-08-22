<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import HuddleView from './HuddleView.svelte';
  import * as m from '$lib/paraglide/messages.js';
  let { open = $bindable(false), workspaceId }: { open?: boolean; workspaceId: string } = $props();
</script>

<Dialog.Root bind:open
  ><Dialog.Content class="h-[min(840px,90vh)] max-w-[min(1180px,95vw)] overflow-hidden p-0" showCloseButton={false}
    ><Dialog.Title class="sr-only">{m['huddle.title']()}</Dialog.Title><HuddleView {workspaceId} /></Dialog.Content
  ></Dialog.Root
>
