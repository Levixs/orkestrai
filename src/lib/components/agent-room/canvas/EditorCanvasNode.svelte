<script lang="ts">
  import { onMount } from 'svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { languages } from '@codemirror/language-data';
  import { FileCode2, MessageSquareQuote, RefreshCw, Save, X } from '@lucide/svelte';
  import NodeShell, { type NodeConnection } from './NodeShell.svelte';
  import IconAction from './IconAction.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  export type EditorNodeData = {
    title: string;
    workspaceId: string;
    payload: { path?: string };
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: EditorNodeData }>();

  let container: HTMLDivElement;
  let view: EditorView | null = null;
  let dirty = $state(false);
  let truncated = $state(false);
  let statusMessage = $state('');
  let saving = $state(false);

  const filePath = $derived(data.payload.path ?? '');
  const fileName = $derived(filePath.split('/').at(-1) ?? 'editor');

  function languageFor(path: string) {
    const ext = path.split('.').at(-1) ?? '';
    return languages.find((item) => item.extensions.includes(ext)) ?? null;
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'Falha na API.');
    return payload.data as T;
  }

  async function loadFile() {
    if (!filePath) return;
    statusMessage = '';
    try {
      const result = await api<{ content: string; truncated: boolean }>(
        `/api/agent-room/workspaces/${data.workspaceId}/fs/read?path=${encodeURIComponent(filePath)}`
      );
      truncated = result.truncated;
      dirty = false;
      const lang = languageFor(filePath);
      const langExtension = lang ? await lang.load() : null;
      view?.destroy();
      view = new EditorView({
        parent: container,
        state: EditorState.create({
          doc: result.content,
          extensions: [
            basicSetup,
            oneDark,
            ...(langExtension ? [langExtension] : []),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) dirty = true;
            }),
            EditorView.theme({
              '&': { height: '100%', fontSize: '12px' },
              '.cm-scroller': { overflow: 'auto' },
            }),
          ],
        }),
      });
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : 'Falha ao abrir arquivo.';
    }
  }

  async function save() {
    if (!view || !filePath) return;
    saving = true;
    statusMessage = '';
    try {
      await api(`/api/agent-room/workspaces/${data.workspaceId}/fs/write`, {
        method: 'PUT',
        body: JSON.stringify({ path: filePath, content: view.state.doc.toString() }),
      });
      dirty = false;
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : 'Falha ao salvar.';
    } finally {
      saving = false;
    }
  }

  async function citeSelection() {
    if (!view) return;
    const selection = view.state.selection.main;
    if (selection.empty) {
      statusMessage = 'Selecione um trecho para citar.';
      return;
    }
    const text = view.state.sliceDoc(selection.from, selection.to);
    const target = (data.connections ?? []).find((connection: NodeConnection) => connection.targetType === 'terminal');
    if (!target) {
      statusMessage = 'Conecte este editor a um terminal para citar.';
      return;
    }
    statusMessage = '';
    try {
      await api(`/api/agent-room/workspaces/${data.workspaceId}/terminals/${target.targetId}/write`, {
        method: 'POST',
        body: JSON.stringify({ data: `\n[citacao de ${fileName}:${selection.from}-${selection.to}]\n${text}\n` }),
      });
      statusMessage = `Citacao enviada para ${target.targetTitle}.`;
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : 'Falha ao citar.';
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      event.stopPropagation();
      save();
    }
  }

  onMount(() => {
    loadFile();
    return () => view?.destroy();
  });
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-editor"
  accent="#7DE5FF"
  minWidth={360}
  minHeight={220}
  onResize={data.onResize}
  connections={data.connections ?? []}
  titleText={data.title}
  onRename={data.onRename}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<FileCode2 size={13} />{/snippet}
  {#snippet title()}
    {fileName}
    {#if dirty}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <span {...props} class="dirty-badge" aria-label="Alteracoes nao salvas">●</span>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top">Alteracoes nao salvas</Tooltip.Content>
      </Tooltip.Root>
    {/if}
    {#if truncated}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <span {...props} class="trunc-badge" aria-label="Arquivo grande: somente os primeiros 512KB foram carregados">truncado</span>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top">Arquivo grande: somente os primeiros 512KB foram carregados</Tooltip.Content>
      </Tooltip.Root>
    {/if}
  {/snippet}
  {#snippet actions()}
    <IconAction label="Citar selecao para agente conectado" onclick={citeSelection}>
      <MessageSquareQuote size={13} />
    </IconAction>
    <IconAction label="Salvar (Cmd/Ctrl+S)" disabled={saving || !dirty} onclick={save}><Save size={13} /></IconAction>
    <IconAction label="Recarregar" onclick={loadFile}><RefreshCw size={13} /></IconAction>
    <IconAction label="Fechar editor" danger onclick={() => data.onDelete(id)}><X size={13} /></IconAction>
  {/snippet}

  <div role="presentation" onkeydown={handleKeydown} class="editor-wrap">
    <p class="editor-path">{filePath}</p>
    <div class="editor-body nodrag nowheel" bind:this={container}></div>
    {#if statusMessage}
      <p class="editor-status">{statusMessage}</p>
    {/if}
  </div>
</NodeShell>

<style>
  .editor-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .dirty-badge {
    color: #FFC857;
    font-size: 10px;
    margin-left: 6px;
  }

  .trunc-badge {
    font-size: 10px;
    color: #FFC857;
    background: rgba(226, 185, 61, 0.12);
    padding: 1px 6px;
    border-radius: 8px;
    margin-left: 6px;
  }

  .editor-path {
    margin: 0;
    padding: 2px 10px;
    font-size: 10px;
    color: #6d6d78;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .editor-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .editor-body :global(.cm-editor) {
    height: 100%;
  }

  .editor-status {
    margin: 0;
    padding: 4px 10px;
    font-size: 11px;
    color: #ffb3b6;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
</style>
