<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import HuddleView from './HuddleView.svelte';
  import * as m from '$lib/paraglide/messages.js';
  let { open = $bindable(false), workspaceId }: { open?: boolean; workspaceId: string } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="grid h-[min(920px,calc(100dvh-1.5rem))]! w-[min(1440px,calc(100vw-1.5rem))]! max-w-none! grid-rows-[minmax(0,1fr)] gap-0! overflow-hidden rounded-lg p-0! sm:max-w-none!"
    showCloseButton={false}
    data-testid="huddle-dialog"
  >
    <Dialog.Title class="sr-only">{m['huddle.title']()}</Dialog.Title>
    <HuddleView {workspaceId} onClose={() => (open = false)} />
  </Dialog.Content>
</Dialog.Root>
