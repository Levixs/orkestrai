<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import AnnotationCenterView from './AnnotationCenterView.svelte';
  import * as m from '$lib/paraglide/messages.js';
  let { open = $bindable(false), workspaceId }: { open?: boolean; workspaceId: string } = $props();
</script>
<Dialog.Root bind:open><Dialog.Content class="h-[min(820px,88vh)] max-w-[min(1120px,94vw)] overflow-hidden p-0" showCloseButton={false}><Dialog.Title class="sr-only">{m['annotations.title']()}</Dialog.Title><AnnotationCenterView {workspaceId} /></Dialog.Content></Dialog.Root>
