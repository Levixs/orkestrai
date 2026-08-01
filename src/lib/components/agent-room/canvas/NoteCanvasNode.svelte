<script lang="ts">
  import type { NodeProps } from '@xyflow/svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { Eye, Pencil, StickyNote, X } from '@lucide/svelte';

  const NOTE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
    yellow: { bg: '#1f1e17', fg: '#e8ddc0', label: 'Amarelo' },
    blue: { bg: '#161b24', fg: '#c9d8f0', label: 'Azul' },
    green: { bg: '#15201a', fg: '#c8ecd4', label: 'Verde' },
    purple: { bg: '#1d1726', fg: '#dccdf0', label: 'Roxo' },
    red: { bg: '#241616', fg: '#f0cccc', label: 'Vermelho' },
    neutral: { bg: '#1C1946', fg: '#d7d8de', label: 'Neutro' },
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

  const preview = $derived(DOMPurify.sanitize(marked.parse(draft, { async: false }) as string));

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
  accent="#FFC857"
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
  {#snippet title()}{data.title || 'Nota'}{/snippet}
  {#snippet actions()}
    <span class="color-swatches nodrag">
      {#each Object.entries(NOTE_COLORS) as [name, preset]}
        <button
          class="swatch"
          class:active={((data.payload as { color?: string }).color ?? 'yellow') === name}
          style:background={preset.bg}
          style:border-color={preset.fg}
          aria-label={preset.label}
          onclick={() => setColor(name)}
        ></button>
      {/each}
    </span>
    <IconAction label={formatted ? 'Editar (raw)' : 'Ver formatado'} onclick={toggleFormatted}>
      {#if formatted}<Pencil size={13} />{:else}<Eye size={13} />{/if}
    </IconAction>
    <IconAction label="Remover nota" danger onclick={() => data.onDelete(id)}>
      <X size={13} /></IconAction>
  {/snippet}

  {#if formatted}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <div
      class="note-content note-preview nodrag nowheel"
      style="--note-bg: {noteColor.bg}; --note-fg: {noteColor.fg}"
      ondblclick={toggleFormatted}
      role="presentation"
    >
      {@html preview}
    </div>
  {:else}
    <textarea
      class="note-content nodrag nowheel"
      style="--note-bg: {noteColor.bg}; --note-fg: {noteColor.fg}"
      bind:value={draft}
      oninput={handleInput}
      onpaste={handlePaste}
      placeholder="Escreva em Markdown..."
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
    background: var(--note-bg, #1f1e17);
    color: var(--note-fg, #e8ddc0);
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
    outline: 1.5px solid rgba(255, 255, 255, 0.75);
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
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 11px;
  }

  .note-preview :global(pre) {
    background: rgba(0, 0, 0, 0.35);
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
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 3px 7px;
    text-align: left;
  }

  .note-preview :global(a) {
    color: #7DE5FF;
  }

  .note-preview :global(img) {
    max-width: 100%;
    border-radius: 8px;
    display: block;
    margin: 0.4em 0;
  }

  .note-preview :global(blockquote) {
    border-left: 3px solid rgba(226, 185, 61, 0.5);
    margin: 0.5em 0;
    padding-left: 0.8em;
    color: #c9c0a3;
  }
</style>
