<script lang="ts">
  import type { NodeProps } from '@xyflow/svelte';
  import { Eye, Pencil, StickyNote, X } from '@lucide/svelte';
  import MarkdownView from '../MarkdownView.svelte';
  import * as m from '$lib/paraglide/messages.js';

  const NOTE_COLORS: Record<string, { color: string; label: string }> = {
    yellow: { color: '#d09a00', label: m['note.color_yellow']() },
    blue: { color: '#3e78d8', label: m['note.color_blue']() },
    green: { color: '#298457', label: m['note.color_green']() },
    purple: { color: '#8357c5', label: m['note.color_purple']() },
    red: { color: '#c84f57', label: m['note.color_red']() },
    neutral: { color: '#777487', label: m['note.color_neutral']() },
  };
  import NodeShell from './NodeShell.svelte';
  import IconAction from './IconAction.svelte';
  import type { NoteNodePayload } from '$lib/modules/agent-room/domain/types.js';

  export type NoteNodeData = {
    title: string;
    workspaceId: string;
    payload: NoteNodePayload;
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    onContentChange: (id: string, content: string) => void;
    onColorChange?: (id: string, color: string) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: NoteNodeData }>();

  let draft = $state(data.payload.content ?? '');
  let formatted = $state(Boolean(data.payload.formatted));
  const noteColor = $derived(NOTE_COLORS[(data.payload as { color?: string }).color ?? 'yellow'] ?? NOTE_COLORS.yellow);

  function setColor(color: string) {
    data.onContentChange(id, draft);
    (data.payload as Record<string, unknown>).color = color;
    data.onColorChange?.(id, color);
  }
  let debounce: ReturnType<typeof setTimeout> | null = null;

  function handleInput() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => data.onContentChange(id, draft), 600);
  }

  function toggleFormatted() {
    formatted = !formatted;
  }

  async function handlePaste(event: ClipboardEvent) {
    const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    event.preventDefault();
    const blob = item.getAsFile();
    if (!blob) return;

    const buffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const ext = blob.type.split('/').at(-1) ?? 'png';
    const path = `.orkestrai/images/${crypto.randomUUID()}.${ext}`;
    const response = await fetch(`/api/agent-room/workspaces/${data.workspaceId}/fs/write-binary`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, base64 }),
    });
    if (!response.ok) return;

    const url = `/api/agent-room/workspaces/${data.workspaceId}/fs/raw?path=${encodeURIComponent(path)}`;
    const textarea = event.target as HTMLTextAreaElement;
    const at = textarea.selectionStart ?? draft.length;
    draft = `${draft.slice(0, at)}![](${url})${draft.slice(at)}`;
    handleInput();
  }
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-note"
  accent="var(--app-warning)"
  minWidth={220}
  minHeight={140}
  onResize={data.onResize}
  connections={data.connections ?? []}
  titleText={data.title}
  onRename={data.onRename}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<StickyNote size={13} />{/snippet}
  {#snippet title()}{data.title || m['note.default_title']()}{/snippet}
  {#snippet actions()}
    <span class="color-swatches nodrag">
      {#each Object.entries(NOTE_COLORS) as [name, preset]}
        <button
          class="swatch"
          class:active={((data.payload as { color?: string }).color ?? 'yellow') === name}
          style:background={preset.color}
          style:border-color="color-mix(in srgb, {preset.color} 70%, var(--app-text))"
          aria-label={preset.label}
          onclick={() => setColor(name)}
        ></button>
      {/each}
    </span>
    <IconAction label={formatted ? m['note.edit_raw']() : m['note.view_formatted']()} onclick={toggleFormatted}>
      {#if formatted}<Pencil size={13} />{:else}<Eye size={13} />{/if}
    </IconAction>
    <IconAction label={m['note.remove']()} danger onclick={() => data.onDelete(id)}>
      <X size={13} /></IconAction>
  {/snippet}

  {#if formatted}
    <div
      class="note-content note-preview nodrag nowheel"
      style="--note-color: {noteColor.color}"
      ondblclick={toggleFormatted}
      role="presentation"
    >
      <MarkdownView content={draft} />
    </div>
  {:else}
    <textarea
      class="note-content nodrag nowheel"
      style="--note-color: {noteColor.color}"
      bind:value={draft}
      oninput={handleInput}
      onpaste={handlePaste}
      placeholder={m['ph.note_content']()}
      spellcheck="false"
    ></textarea>
  {/if}
</NodeShell>

<style>
  .note-content {
    flex: 1;
    min-height: 0;
    resize: none;
    border: none;
    outline: none;
    padding: 10px;
    background: color-mix(in srgb, var(--note-color, var(--app-warning)) 12%, var(--app-surface));
    color: var(--app-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    line-height: 1.5;
  }

  .note-preview {
    overflow-y: auto;
    font-family: inherit;
    cursor: text;
  }

  .color-swatches {
    display: inline-flex;
    gap: 4px;
    margin-right: 4px;
  }

  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    cursor: pointer;
    padding: 0;
  }

  .swatch.active {
    outline: 1.5px solid var(--app-text);
    outline-offset: 1px;
  }

  .note-preview :global(h1),
  .note-preview :global(h2),
  .note-preview :global(h3) {
    margin: 0.5em 0 0.3em;
    line-height: 1.3;
  }

  .note-preview :global(p) {
    margin: 0 0 0.5em;
  }

  .note-preview :global(code) {
    background: var(--app-border);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 11px;
  }

  .note-preview :global(pre) {
    background: var(--app-canvas);
    border-radius: 8px;
    padding: 8px;
    overflow-x: auto;
  }

  .note-preview :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .note-preview :global(ul),
  .note-preview :global(ol) {
    margin: 0 0 0.5em;
    padding-left: 1.2em;
  }

  .note-preview :global(table) {
    border-collapse: collapse;
    margin: 0.5em 0;
    width: 100%;
  }

  .note-preview :global(th),
  .note-preview :global(td) {
    border: 1px solid var(--app-border);
    padding: 3px 7px;
    text-align: left;
  }

  .note-preview :global(a) {
    color: var(--app-secondary);
  }

  .note-preview :global(img) {
    max-width: 100%;
    border-radius: 8px;
    display: block;
    margin: 0.4em 0;
  }

  .note-preview :global(blockquote) {
    border-left: 3px solid var(--note-color, var(--app-warning));
    margin: 0.5em 0;
    padding-left: 0.8em;
    color: var(--app-text-soft);
  }
</style>
