<script lang="ts">
  import { onMount } from 'svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, History, ImagePlus, Plus, SquareKanban, Trash2, X } from '@lucide/svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Dialog from '$lib/components/ui/dialog';
  import NodeShell from './NodeShell.svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';
  import { arrayBufferToBase64 } from '../base64.js';

  type BoardTask = {
    id: string;
    title: string;
    status: 'todo' | 'doing' | 'done';
    assigneeNodeId: string | null;
    assigneeTitle: string | null;
    imagePath: string | null;
    images: string[];
    createdBy: string;
    updatedAt: string;
    archivedAt: string | null;
  };

  export type TasksNodeData = {
    title: string;
    workspaceId: string;
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    connections?: import('./NodeShell.svelte').NodeConnection[];
    onJumpToNode?: (nodeId: string) => void;
    onRemoveConnection?: (edgeId: string) => void;
    onRename?: (id: string, title: string) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: TasksNodeData }>();

  const COLUMNS: Array<{ status: BoardTask['status']; label: string; hint: string }> = [
    { status: 'todo', label: 'A fazer', hint: '#7DE5FF' },
    { status: 'doing', label: 'Fazendo', hint: '#FFC857' },
    { status: 'done', label: 'Feito', hint: '#8ec98e' },
  ];

  let tasks = $state<BoardTask[]>([]);
  let agents = $state<Array<{ id: string; title: string }>>([]);
  let draft = $state('');
  let dragTaskId = $state<string | null>(null);
  let dropTarget = $state<BoardTask['status'] | null>(null);
  let editingId = $state<string | null>(null);
  let editDraft = $state('');
  let fileInput: HTMLInputElement;
  let imageTargetId = $state<string | null>(null);

  // -- Historico / arquivamento ------------------------------------------------
  // Quadro mostra so tarefas vivas; concluidas podem ser arquivadas (saem do
  // quadro, ficam no historico do workspace — o "o que foi feito" do projeto).
  let view = $state<'board' | 'history'>('board');
  let historyItems = $state<BoardTask[]>([]);
  let historyLoading = $state(false);

  const doneCount = $derived(tasks.filter((task) => task.status === 'done').length);

  function fmtWhen(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  async function openHistory() {
    view = 'history';
    historyLoading = true;
    try {
      historyItems = (await api<BoardTask[]>(`/api/agent-room/workspaces/${data.workspaceId}/tasks/history`)) ?? [];
    } finally {
      historyLoading = false;
    }
  }

  async function archiveTask(task: BoardTask) {
    await api(`/api/agent-room/workspaces/${data.workspaceId}/tasks/${task.id}/archive`, { method: 'POST' });
    await refresh();
  }

  async function archiveAllDone() {
    await api(`/api/agent-room/workspaces/${data.workspaceId}/tasks/archive-done`, { method: 'POST' });
    await refresh();
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
    try {
      const response = await fetch(path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      const payload = await response.json();
      if (!response.ok || payload.error) return null;
      return payload.data as T;
    } catch {
      return null;
    }
  }

  async function refresh() {
    const [taskList, nodeList] = await Promise.all([
      api<BoardTask[]>(`/api/agent-room/workspaces/${data.workspaceId}/tasks`),
      api<Array<{ id: string; type: string; title: string | null }>>(`/api/agent-room/workspaces/${data.workspaceId}/nodes`),
    ]);
    if (taskList) tasks = taskList;
    if (nodeList) agents = nodeList.filter((node) => node.type === 'terminal').map((node) => ({ id: node.id, title: node.title ?? 'terminal' }));
  }

  onMount(() => {
    refresh();
    // Agentes (lider) alteram o quadro pela bridge — sincroniza periodico.
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
  });

  async function addTask() {
    const title = draft.trim();
    if (!title) return;
    draft = '';
    await api(`/api/agent-room/workspaces/${data.workspaceId}/tasks`, { method: 'POST', body: JSON.stringify({ title }) });
    await refresh();
  }

  async function patchTask(taskId: string, patch: Record<string, unknown>) {
    await api(`/api/agent-room/workspaces/${data.workspaceId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(patch) });
    await refresh();
  }

  async function removeTask(task: BoardTask) {
    await api(`/api/agent-room/workspaces/${data.workspaceId}/tasks/${task.id}`, { method: 'DELETE' });
    await refresh();
  }

  // -- Edicao inline do titulo -------------------------------------------------
  function startEdit(task: BoardTask) {
    editingId = task.id;
    editDraft = task.title;
  }

  async function commitEdit() {
    const taskId = editingId;
    editingId = null;
    const title = editDraft.trim();
    if (taskId && title) await patchTask(taskId, { title });
  }

  // -- Drag and drop entre colunas ----------------------------------------------
  function onDragStart(event: DragEvent, task: BoardTask) {
    dragTaskId = task.id;
    event.dataTransfer?.setData('text/plain', task.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(event: DragEvent, status: BoardTask['status']) {
    if (!dragTaskId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dropTarget = status;
  }

  async function onDrop(event: DragEvent, status: BoardTask['status']) {
    event.preventDefault();
    const taskId = dragTaskId ?? event.dataTransfer?.getData('text/plain');
    dropTarget = null;
    dragTaskId = null;
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    await patchTask(task.id, { status });
  }

  // -- Imagens de referencia (multiplas, com viewer) ---------------------------
  let viewerTask = $state<BoardTask | null>(null);
  let viewerIndex = $state(0);
  let imageError = $state('');

  function pickImage(task: BoardTask) {
    imageError = '';
    imageTargetId = task.id;
    fileInput.click();
  }

  /** base64 em chunks — o spread direto estoura a pilha em imagens >100 KB. */
  async function uploadImage(file: File, taskId: string) {
    try {
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      const ext = file.type.split('/').at(-1) ?? 'png';
      const path = `.orkestrai/images/${crypto.randomUUID()}.${ext}`;
      const response = await fetch(`/api/agent-room/workspaces/${data.workspaceId}/fs/write-binary`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, base64 }),
      });
      if (!response.ok) throw new Error(`Falha ao salvar a imagem (HTTP ${response.status}).`);
      await api(`/api/agent-room/workspaces/${data.workspaceId}/tasks/${taskId}/images`, {
        method: 'POST',
        body: JSON.stringify({ path }),
      });
      imageError = '';
      await refresh();
    } catch (error) {
      imageError = error instanceof Error ? error.message : 'Nao consegui anexar a imagem.';
    }
  }

  async function onFilePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length && imageTargetId) {
      for (const file of files) await uploadImage(file, imageTargetId);
    }
    imageTargetId = null;
  }

  async function onCardPaste(event: ClipboardEvent, task: BoardTask) {
    const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (file) await uploadImage(file, task.id);
  }

  function openViewer(task: BoardTask, index: number) {
    viewerTask = task;
    viewerIndex = index;
  }

  function viewerMove(delta: number) {
    if (!viewerTask?.images.length) return;
    viewerIndex = (viewerIndex + delta + viewerTask.images.length) % viewerTask.images.length;
  }

  async function viewerDelete() {
    if (!viewerTask) return;
    const path = viewerTask.images[viewerIndex];
    if (!path) return;
    await api(`/api/agent-room/workspaces/${data.workspaceId}/tasks/${viewerTask.id}/images?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    await refresh();
    const updated = tasks.find((task) => task.id === viewerTask?.id);
    if (!updated?.images.length) viewerTask = null;
    else {
      viewerTask = updated;
      viewerIndex = Math.min(viewerIndex, updated.images.length - 1);
    }
  }

  const imageUrl = (path: string) =>
    `/api/agent-room/workspaces/${data.workspaceId}/fs/raw?path=${encodeURIComponent(path)}`;
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-tasks"
  accent="#8ec98e"
  minWidth={400}
  minHeight={260}
  onResize={data.onResize}
  titleText={data.title}
  onRename={data.onRename}
  connections={data.connections ?? []}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<SquareKanban size={13} />{/snippet}
  {#snippet title()}{data.title || 'Tarefas'}{/snippet}
  {#snippet actions()}
    {#if view === 'board'}
      {#if doneCount > 0}
        <HeaderIconButton label={`Arquivar ${doneCount} concluida(s) (somem do quadro, ficam no historico)`} class="node-action-btn" side="left" onclick={archiveAllDone}>
          <Archive size={13} /></HeaderIconButton>
      {/if}
      <HeaderIconButton label="Historico (concluidas e arquivadas)" class="node-action-btn" side="left" onclick={openHistory}>
        <History size={13} /></HeaderIconButton>
    {:else}
      <HeaderIconButton label="Voltar ao quadro" class="node-action-btn" side="left" onclick={() => (view = 'board')}>
        <ArchiveRestore size={13} /></HeaderIconButton>
    {/if}
    <HeaderIconButton label="Remover quadro" class="node-action-btn" danger side="left" onclick={() => data.onDelete(id)}>
      <X size={13} /></HeaderIconButton>
  {/snippet}

  <input bind:this={fileInput} type="file" accept="image/*" multiple class="tb-hidden" onchange={onFilePicked} />

  {#if imageError}
    <p class="tb-image-error nodrag">{imageError}</p>
  {/if}

  {#if view === 'history'}
    <div class="tb-history nodrag nowheel">
      {#if historyLoading}
        <span class="tb-empty">Carregando historico…</span>
      {:else if historyItems.length === 0}
        <span class="tb-empty">Nada concluido ainda — o que o time entregar aparece aqui.</span>
      {:else}
        {#each historyItems as item (item.id)}
          <article class="tb-history-row">
            <div class="tb-history-main">
              <span class="tb-history-title">{item.title}</span>
              <span class="tb-history-meta">
                {item.assigneeTitle ?? 'sem responsavel'} · {fmtWhen(item.updatedAt)}
                {#if item.archivedAt} · arquivada{/if}
              </span>
            </div>
            <span class="tb-history-status" class:archived={Boolean(item.archivedAt)}>{item.archivedAt ? 'arquivada' : 'feito'}</span>
          </article>
        {/each}
      {/if}
    </div>
  {:else}
  <div class="tb-add nodrag">
    <input
      bind:value={draft}
      placeholder="Nova tarefa… (Enter adiciona)"
      aria-label="Nova tarefa"
      autocomplete="off"
      spellcheck="false"
      onkeydown={(event) => {
        if (event.key === 'Enter') addTask();
      }}
    />
    <HeaderIconButton label="Adicionar tarefa" class="tb-add-btn" side="top" onclick={addTask} disabled={!draft.trim()}>
      <Plus size={14} />
    </HeaderIconButton>
  </div>

  <div class="tb-board nodrag nowheel">
    {#each COLUMNS as column (column.status)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <section
        class="tb-column"
        class:drop-target={dropTarget === column.status}
        style:--column-hint={column.hint}
        ondragover={(event) => onDragOver(event, column.status)}
        ondragleave={() => (dropTarget = null)}
        ondrop={(event) => onDrop(event, column.status)}
      >
        <header class="tb-column-head">
          <span class="tb-dot"></span>
          <span class="tb-label">{column.label}</span>
          <span class="tb-count">{tasks.filter((task) => task.status === column.status).length}</span>
        </header>

        <div class="tb-cards">
          {#each tasks.filter((task) => task.status === column.status) as task (task.id)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <article
              class="tb-card"
              class:dragging={dragTaskId === task.id}
              draggable="true"
              ondragstart={(event) => onDragStart(event, task)}
              ondragend={() => { dragTaskId = null; dropTarget = null; }}
              onpaste={(event) => onCardPaste(event, task)}
              tabindex="0"
            >
              {#if task.images?.length}
                <div class="tb-thumbs">
                  {#each task.images as path, index (path)}
                    <button class="tb-thumb-btn" aria-label={`Ver imagem ${index + 1} de ${task.images.length}`} onclick={() => openViewer(task, index)}>
                      <img class="tb-thumb" src={imageUrl(path)} alt="" loading="lazy" />
                    </button>
                  {/each}
                </div>
              {/if}
              <div class="tb-card-top">
                {#if editingId === task.id}
                  <input
                    class="tb-edit nodrag"
                    bind:value={editDraft}
                    aria-label="Editar tarefa"
                    spellcheck="false"
                    onkeydown={(event) => {
                      if (event.key === 'Enter') commitEdit();
                      if (event.key === 'Escape') editingId = null;
                    }}
                    onblur={commitEdit}
                  />
                {:else}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span class="tb-title" title={undefined} ondblclick={() => startEdit(task)}>{task.title}</span>
                {/if}
                <HeaderIconButton label="Remover tarefa" class="tb-icon-btn" side="top" onclick={() => removeTask(task)}>
                  <Trash2 size={11} />
                </HeaderIconButton>
              </div>
              <div class="tb-card-bottom">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="tb-assignee" aria-label="Atribuir a um agente">
                    {task.assigneeTitle ?? 'atribuir'}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content class="w-44">
                    <DropdownMenu.Item onclick={() => patchTask(task.id, { assigneeNodeId: null })}>Sem responsavel</DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    {#each agents as agent (agent.id)}
                      <DropdownMenu.Item onclick={() => patchTask(task.id, { assigneeNodeId: agent.id })}>{agent.title}</DropdownMenu.Item>
                    {/each}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
                <HeaderIconButton label="Anexar imagem (ou cole com Ctrl+V no cartao)" class="tb-icon-btn subtle" side="top" onclick={() => pickImage(task)}>
                  <ImagePlus size={11} />
                </HeaderIconButton>
                {#if task.status === 'done'}
                  <HeaderIconButton label="Arquivar (sai do quadro, fica no historico)" class="tb-icon-btn subtle" side="top" onclick={() => archiveTask(task)}>
                    <Archive size={11} />
                  </HeaderIconButton>
                {/if}
              </div>
            </article>
          {:else}
            <span class="tb-empty">Arraste cartoes para ca</span>
          {/each}
        </div>
      </section>
    {/each}
  </div>
  {/if}
</NodeShell>

{#if viewerTask}
  <Dialog.Root open={viewerTask !== null} onOpenChange={(open: boolean) => !open && (viewerTask = null)}>
    <Dialog.Content class="tb-viewer-content">
      <Dialog.Header>
        <Dialog.Title>{viewerTask.title}</Dialog.Title>
        <Dialog.Description>Imagem {viewerIndex + 1} de {viewerTask.images.length} — referencia da tarefa</Dialog.Description>
      </Dialog.Header>
      <div class="tb-viewer-body">
        <button class="tb-viewer-nav" aria-label="Imagem anterior" onclick={() => viewerMove(-1)} disabled={viewerTask.images.length < 2}>
          <ChevronLeft size={18} />
        </button>
        <img class="tb-viewer-img" src={imageUrl(viewerTask.images[viewerIndex])} alt="Referencia da tarefa" />
        <button class="tb-viewer-nav" aria-label="Proxima imagem" onclick={() => viewerMove(1)} disabled={viewerTask.images.length < 2}>
          <ChevronRight size={18} />
        </button>
      </div>
      <Dialog.Footer>
        <button class="tb-viewer-delete" onclick={viewerDelete}>
          <Trash2 size={13} /> Remover imagem
        </button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}

<style>
  .tb-hidden {
    display: none;
  }

  .tb-image-error {
    margin: 0 8px 6px;
    font-size: 11px;
    color: #ff9c9f;
  }

  .tb-history {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    padding: 2px 6px 8px;
    flex: 1;
    min-height: 0;
  }

  .tb-history-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .tb-history-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .tb-history-title {
    font-size: 12px;
    color: #d7d8de;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tb-history-meta {
    font-size: 10px;
    color: #6d6d78;
    font-variant-numeric: tabular-nums;
  }

  .tb-history-status {
    flex-shrink: 0;
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8ec98e;
    background: rgba(142, 201, 142, 0.12);
    border-radius: 999px;
    padding: 2px 8px;
  }

  .tb-history-status.archived {
    color: #8b8c96;
    background: rgba(255, 255, 255, 0.07);
  }

  .tb-add {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .tb-add input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: #e6e6eb;
    font-size: 12px;
  }

  .tb-add input:focus-visible {
    outline: none;
  }

  .tb-board {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 8px;
    padding: 10px;
    overflow: auto;
    background: #141419;
  }

  .tb-column {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid transparent;
    padding: 8px;
    transition: border-color 140ms ease, background 140ms ease;
  }

  .tb-column.drop-target {
    border-color: var(--column-hint, #7C4DFF);
    background: rgba(255, 255, 255, 0.05);
  }

  .tb-column-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 2px;
  }

  .tb-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--column-hint, #7C4DFF);
  }

  .tb-label {
    flex: 1;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #9a9aa5;
  }

  .tb-count {
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: #6d6d78;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 1px 7px;
  }

  .tb-cards {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    min-height: 40px;
  }

  .tb-empty {
    font-size: 11px;
    color: #4a4a55;
    font-style: italic;
    text-align: center;
    padding: 14px 4px;
    border: 1px dashed rgba(255, 255, 255, 0.08);
    border-radius: 8px;
  }

  .tb-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #1e1f26;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 9px;
    padding: 7px 8px;
    cursor: grab;
    transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
  }

  .tb-card:hover {
    border-color: rgba(255, 255, 255, 0.16);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }

  .tb-card.dragging {
    opacity: 0.45;
    cursor: grabbing;
  }

  .tb-card:focus-visible {
    outline: 2px solid #7C4DFF;
    outline-offset: 1px;
  }

  .tb-cover {
    width: 100%;
    max-height: 90px;
    object-fit: cover;
    border-radius: 6px;
    display: block;
  }

  .tb-thumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tb-thumb-btn {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 0;
    background: transparent;
    cursor: zoom-in;
    overflow: hidden;
    line-height: 0;
  }

  .tb-thumb-btn:hover {
    border-color: rgba(255, 255, 255, 0.3);
  }

  .tb-thumb {
    width: 52px;
    height: 38px;
    object-fit: cover;
    display: block;
  }

  :global(.tb-viewer-content) {
    max-width: min(860px, 92vw) !important;
  }

  .tb-viewer-body {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
  }

  .tb-viewer-img {
    max-width: 100%;
    max-height: 62vh;
    border-radius: 10px;
    object-fit: contain;
    background: #101018;
  }

  .tb-viewer-nav {
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: #c7c8d0;
    border-radius: 8px;
    padding: 8px 4px;
    cursor: pointer;
  }

  .tb-viewer-nav:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
  }

  .tb-viewer-nav:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .tb-viewer-delete {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgba(229, 72, 77, 0.4);
    background: rgba(229, 72, 77, 0.12);
    color: #ff9c9f;
    font-size: 12px;
    border-radius: 8px;
    padding: 6px 12px;
    cursor: pointer;
  }

  .tb-viewer-delete:hover {
    background: rgba(229, 72, 77, 0.22);
  }

  .tb-card-top {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .tb-title {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    line-height: 1.4;
    color: #e6e6eb;
    overflow-wrap: break-word;
    cursor: text;
  }

  .tb-edit {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: #e6e6eb;
    font-size: 12px;
    padding: 2px 6px;
  }

  .tb-card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .tb-board :global(.tb-assignee) {
    border: none;
    background: rgba(142, 201, 142, 0.12);
    color: #8ec98e;
    font-size: 10px;
    border-radius: 6px;
    padding: 2px 8px;
    cursor: pointer;
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tb-board :global(.tb-icon-btn) {
    display: inline-flex;
    border: none;
    background: transparent;
    color: #6d6d78;
    cursor: pointer;
    padding: 2px;
    border-radius: 5px;
  }

  .tb-board :global(.tb-icon-btn:hover) {
    color: #e5484d;
    background: rgba(255, 255, 255, 0.06);
  }

  .tb-board :global(.tb-icon-btn.subtle:hover) {
    color: #7DE5FF;
  }

  .tb-board :global(.tb-add-btn) {
    display: inline-flex;
    border: none;
    background: transparent;
    color: #8ec98e;
    cursor: pointer;
    padding: 2px;
  }

  .tb-board :global(.tb-add-btn:disabled) {
    opacity: 0.3;
    cursor: default;
  }

  .tb-add :global(.tb-add-btn) {
    display: inline-flex;
    border: none;
    background: transparent;
    color: #8ec98e;
    cursor: pointer;
    padding: 2px;
  }

  .tb-add :global(.tb-add-btn:disabled) {
    opacity: 0.3;
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .tb-card,
    .tb-column {
      transition: none;
    }
  }
</style>
