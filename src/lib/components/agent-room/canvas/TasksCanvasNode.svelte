<script lang="ts">
  import { onMount } from 'svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, History, ImagePlus, Link2, Plus, SquareKanban, StickyNote, Trash2, X } from '@lucide/svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Dialog from '$lib/components/ui/dialog';
  import NodeShell from './NodeShell.svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';
  import MarkdownView from '../MarkdownView.svelte';
  import { arrayBufferToBase64 } from '../base64.js';
  import * as m from '$lib/paraglide/messages.js';

  type BoardTask = {
    id: string;
    title: string;
    description: string | null;
    status: 'todo' | 'doing' | 'done';
    assigneeNodeId: string | null;
    assigneeTitle: string | null;
    imagePath: string | null;
    images: string[];
    createdBy: string;
    updatedAt: string;
    archivedAt: string | null;
    noteId: string | null;
    noteTitle: string | null;
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

  const COLUMNS: Array<{ status: BoardTask['status']; label: string; hint: string }> = $derived([
    { status: 'todo', label: m['tasks.col_todo'](), hint: '#7DE5FF' },
    { status: 'doing', label: m['tasks.col_doing'](), hint: '#FFC857' },
    { status: 'done', label: m['tasks.col_done'](), hint: '#8ec98e' },
  ]);

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
  let notes = $state<Array<{ id: string; title: string }>>([]);
  // Nota aberta a partir do historico (pode estar arquivada — fora do canvas).
  let noteViewer = $state<{ title: string; content: string } | null>(null);

  async function openLinkedNote(noteId: string, onCanvas: boolean) {
    if (onCanvas && data.onJumpToNode) {
      data.onJumpToNode(noteId);
      return;
    }
    const node = await api<{ title: string | null; payload?: { content?: string } }>(`/api/agent-room/workspaces/${data.workspaceId}/nodes/${noteId}`);
    if (node) noteViewer = { title: node.title ?? m['tasks.note_title_fallback'](), content: node.payload?.content ?? '' };
  }

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
    if (nodeList) {
      agents = nodeList.filter((node) => node.type === 'terminal').map((node) => ({ id: node.id, title: node.title ?? m['tasks.terminal_fallback']() }));
      notes = nodeList.filter((node) => node.type === 'note').map((node) => ({ id: node.id, title: node.title ?? m['tasks.note_fallback']() }));
    }
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
    const description = draftDescription.trim();
    let images: string[] = [];
    try {
      for (const file of stagedImages) images = [...images, await writeImageFile(file)];
    } catch (error) {
      imageError = error instanceof Error ? error.message : m['tasks.err_image_attach']();
      return;
    }
    const task = await api<BoardTask>(`/api/agent-room/workspaces/${data.workspaceId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ title, description: description || undefined, images }),
    });
    if (!task) return;
    imageError = '';
    draft = '';
    draftDescription = '';
    clearStaged();
    composerOpen = false;
    await refresh();
  }

  // -- Imagens no composer (anexar ANTES de criar a tarefa) ----------------------
  let composerOpen = $state(false);
  let draftDescription = $state('');
  let stagedImages = $state<File[]>([]);
  let stagedPreviews = $state<string[]>([]);

  function stageImages(files: File[]) {
    for (const file of files) {
      if (stagedImages.length >= 6) break;
      stagedImages = [...stagedImages, file];
      stagedPreviews = [...stagedPreviews, URL.createObjectURL(file)];
    }
  }

  function unstageImage(index: number) {
    URL.revokeObjectURL(stagedPreviews[index]);
    stagedImages = stagedImages.filter((_, i) => i !== index);
    stagedPreviews = stagedPreviews.filter((_, i) => i !== index);
  }

  function clearStaged() {
    for (const preview of stagedPreviews) URL.revokeObjectURL(preview);
    stagedImages = [];
    stagedPreviews = [];
  }

  function onComposerFilePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    stageImages([...(input.files ?? [])]);
    input.value = '';
  }

  function onComposerPaste(event: ClipboardEvent) {
    const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (file) stageImages([file]);
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

  // -- Edicao inline da descricao (markdown, duplo-clique) -----------------------
  let editingDescId = $state<string | null>(null);
  let editDescDraft = $state('');

  function startDescEdit(task: BoardTask) {
    editingDescId = task.id;
    editDescDraft = task.description ?? '';
  }

  async function commitDescEdit() {
    const taskId = editingDescId;
    editingDescId = null;
    if (taskId) await patchTask(taskId, { description: editDescDraft.trim() || null });
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
  async function writeImageFile(file: File): Promise<string> {
    const base64 = arrayBufferToBase64(await file.arrayBuffer());
    const ext = file.type.split('/').at(-1) ?? 'png';
    const path = `.orkestrai/images/${crypto.randomUUID()}.${ext}`;
    const response = await fetch(`/api/agent-room/workspaces/${data.workspaceId}/fs/write-binary`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, base64 }),
    });
    if (!response.ok) throw new Error(m['tasks.err_image_http']({ status: response.status }));
    return path;
  }

  async function uploadImage(file: File, taskId: string) {
    try {
      const path = await writeImageFile(file);
      await api(`/api/agent-room/workspaces/${data.workspaceId}/tasks/${taskId}/images`, {
        method: 'POST',
        body: JSON.stringify({ path }),
      });
      imageError = '';
      await refresh();
    } catch (error) {
      imageError = error instanceof Error ? error.message : m['tasks.err_image_attach']();
    }
  }

  async function onFilePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    if (imageTargetId) {
      for (const file of files) await uploadImage(file, imageTargetId);
    } else {
      // Sem alvo: composer de nova tarefa (anexar ANTES de criar).
      stageImages(files);
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
  {#snippet title()}{data.title || m['tasks.title_default']()}{/snippet}
  {#snippet actions()}
    {#if view === 'board'}
      {#if doneCount > 0}
        <HeaderIconButton label={m['tasks.archive_done_label']({ count: doneCount })} class="node-action-btn" side="left" onclick={archiveAllDone}>
          <Archive size={13} /></HeaderIconButton>
      {/if}
      <HeaderIconButton label={m['tasks.history_action']()} class="node-action-btn" side="left" onclick={openHistory}>
        <History size={13} /></HeaderIconButton>
    {:else}
      <HeaderIconButton label={m['tasks.back_to_board']()} class="node-action-btn" side="left" onclick={() => (view = 'board')}>
        <ArchiveRestore size={13} /></HeaderIconButton>
    {/if}
    <HeaderIconButton label={m['tasks.remove_board']()} class="node-action-btn" danger side="left" onclick={() => data.onDelete(id)}>
      <X size={13} /></HeaderIconButton>
  {/snippet}

  <input bind:this={fileInput} type="file" accept="image/*" multiple class="tb-hidden" onchange={onFilePicked} />

  {#if imageError}
    <p class="tb-image-error nodrag">{imageError}</p>
  {/if}

  {#if view === 'history'}
    <div class="tb-history nodrag nowheel">
      {#if historyLoading}
        <span class="tb-empty">{m['tasks.history_loading']()}</span>
      {:else if historyItems.length === 0}
        <span class="tb-empty">{m['tasks.history_empty']()}</span>
      {:else}
        {#each historyItems as item (item.id)}
          <article class="tb-history-row">
            <div class="tb-history-main">
              <span class="tb-history-title">{item.title}</span>
              <span class="tb-history-meta">
                {item.assigneeTitle ?? m['tasks.no_assignee_inline']()} · {fmtWhen(item.updatedAt)}
                {#if item.archivedAt} · {m['tasks.status_archived']()}{/if}
              </span>
            </div>
            {#if item.noteId}
              <button
                class="tb-note-chip"
                title={m['tasks.open_note_title']({ title: item.noteTitle ?? m['tasks.note_fallback']() })}
                onclick={() => openLinkedNote(item.noteId!, !item.archivedAt)}
              >
                <StickyNote size={10} />
                <span class="tb-note-chip-label">{item.noteTitle ?? m['tasks.note_fallback']()}</span>
              </button>
            {/if}
            <span class="tb-history-status" class:archived={Boolean(item.archivedAt)}>{item.archivedAt ? m['tasks.status_archived']() : m['tasks.status_done']()}</span>
          </article>
        {/each}
      {/if}
    </div>
  {:else}
  <div class="tb-add nodrag">
    {#if composerOpen}
      <div class="tb-composer">
        <input
          bind:value={draft}
          placeholder={m['ph.task_title']()}
          aria-label={m['tasks.title_aria']()}
          autocomplete="off"
          spellcheck="false"
          onpaste={onComposerPaste}
          onkeydown={(event) => {
            if (event.key === 'Enter') addTask();
            if (event.key === 'Escape') composerOpen = false;
          }}
        />
        <textarea
          bind:value={draftDescription}
          placeholder={m['ph.task_desc']()}
          aria-label={m['tasks.desc_aria']()}
          rows="3"
          spellcheck="false"
          onpaste={onComposerPaste}
        ></textarea>
        {#if stagedPreviews.length}
          <div class="tb-staged">
            {#each stagedPreviews as preview, index (preview)}
              <span class="tb-staged-thumb">
                <img src={preview} alt="" />
                <button class="tb-staged-x" aria-label={m['tasks.image_remove']()} onclick={() => unstageImage(index)}>×</button>
              </span>
            {/each}
          </div>
        {/if}
        <div class="tb-composer-actions">
          <HeaderIconButton label={m['tasks.attach_image']()} class="tb-icon-btn subtle" side="top" onclick={() => { imageTargetId = null; fileInput.click(); }}>
            <ImagePlus size={13} />
          </HeaderIconButton>
          <span class="tb-spacer"></span>
          <button class="tb-cancel" onclick={() => { composerOpen = false; clearStaged(); }}>{m['tasks.cancel']()}</button>
          <HeaderIconButton label={m['tasks.add_task']()} class="tb-add-btn" side="top" onclick={addTask} disabled={!draft.trim()}>
            <Plus size={14} />
          </HeaderIconButton>
        </div>
      </div>
    {:else}
      <button class="tb-add-open" onclick={() => (composerOpen = true)}>
        <Plus size={14} /> {m['tasks.add_task']()}
      </button>
    {/if}
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
                    <button class="tb-thumb-btn" aria-label={m['tasks.view_image']({ index: index + 1, total: task.images.length })} onclick={() => openViewer(task, index)}>
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
                    aria-label={m['tasks.edit_task']()}
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
                <HeaderIconButton label={m['tasks.remove_task']()} class="tb-icon-btn" side="top" onclick={() => removeTask(task)}>
                  <Trash2 size={11} />
                </HeaderIconButton>
              </div>
              {#if task.description?.trim()}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="tb-desc" ondblclick={() => startDescEdit(task)}>
                  <MarkdownView content={task.description} compact />
                </div>
              {:else if editingDescId === task.id}{/if}
              {#if editingDescId === task.id}
                <textarea
                  class="tb-desc-edit nodrag"
                  bind:value={editDescDraft}
                  aria-label={m['tasks.edit_desc']()}
                  rows="4"
                  spellcheck="false"
                  onkeydown={(event) => {
                    if (event.key === 'Escape') editingDescId = null;
                  }}
                  onblur={commitDescEdit}
                ></textarea>
              {/if}
              <div class="tb-card-bottom">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="tb-assignee" aria-label={m['tasks.assign_aria']()}>
                    {task.assigneeTitle ?? m['tasks.assign_fallback']()}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content class="w-44">
                    <DropdownMenu.Item onclick={() => patchTask(task.id, { assigneeNodeId: null })}>{m['tasks.no_assignee']()}</DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    {#each agents as agent (agent.id)}
                      <DropdownMenu.Item onclick={() => patchTask(task.id, { assigneeNodeId: agent.id })}>{agent.title}</DropdownMenu.Item>
                    {/each}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
                {#if task.noteId}
                  <button
                    class="tb-note-chip"
                    title={m['tasks.linked_note_title']({ title: task.noteTitle ?? m['tasks.note_fallback']() })}
                    onclick={() => openLinkedNote(task.noteId!, true)}
                  >
                    <StickyNote size={10} />
                    <span class="tb-note-chip-label">{task.noteTitle ?? m['tasks.note_fallback']()}</span>
                  </button>
                {/if}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="tb-icon-btn subtle tb-link-trigger" aria-label={m['tasks.link_note_aria']()}>
                    <Link2 size={11} />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content class="w-52">
                    {#if task.noteId}
                      <DropdownMenu.Item onclick={() => patchTask(task.id, { noteId: null })}>{m['tasks.unlink_note']()}</DropdownMenu.Item>
                      <DropdownMenu.Separator />
                    {/if}
                    {#each notes.filter((note) => note.id !== task.noteId) as note (note.id)}
                      <DropdownMenu.Item onclick={() => patchTask(task.id, { noteId: note.id })}>{note.title}</DropdownMenu.Item>
                    {:else}
                      <DropdownMenu.Item disabled>{m['tasks.no_notes']()}</DropdownMenu.Item>
                    {/each}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
                <HeaderIconButton label={m['tasks.attach_image_card']()} class="tb-icon-btn subtle" side="top" onclick={() => pickImage(task)}>
                  <ImagePlus size={11} />
                </HeaderIconButton>
                {#if task.status === 'done'}
                  <HeaderIconButton label={m['tasks.archive_task']()} class="tb-icon-btn subtle" side="top" onclick={() => archiveTask(task)}>
                    <Archive size={11} />
                  </HeaderIconButton>
                {/if}
              </div>
            </article>
          {:else}
            <span class="tb-empty">{m['tasks.drop_hint']()}</span>
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
        <Dialog.Description>{m['tasks.viewer_desc']({ index: viewerIndex + 1, total: viewerTask.images.length })}</Dialog.Description>
      </Dialog.Header>
      <div class="tb-viewer-body">
        <button class="tb-viewer-nav" aria-label={m['tasks.img_prev']()} onclick={() => viewerMove(-1)} disabled={viewerTask.images.length < 2}>
          <ChevronLeft size={18} />
        </button>
        <img class="tb-viewer-img" src={imageUrl(viewerTask.images[viewerIndex])} alt={m['tasks.img_alt']()} />
        <button class="tb-viewer-nav" aria-label={m['tasks.img_next']()} onclick={() => viewerMove(1)} disabled={viewerTask.images.length < 2}>
          <ChevronRight size={18} />
        </button>
      </div>
      <Dialog.Footer>
        <button class="tb-viewer-delete" onclick={viewerDelete}>
          <Trash2 size={13} /> {m['tasks.image_remove']()}
        </button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}

{#if noteViewer}
  <Dialog.Root open={noteViewer !== null} onOpenChange={(open: boolean) => !open && (noteViewer = null)}>
    <Dialog.Content class="tb-viewer-content">
      <Dialog.Header>
        <Dialog.Title>{noteViewer.title}</Dialog.Title>
        <Dialog.Description>{m['tasks.note_viewer_desc']()}</Dialog.Description>
      </Dialog.Header>
      <div class="tb-note-viewer-body nodrag nowheel">
        <MarkdownView content={noteViewer.content} />
      </div>
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

  .tb-note-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 110px;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid rgba(125, 229, 255, 0.25);
    background: rgba(125, 229, 255, 0.08);
    color: #7de5ff;
    font-size: 9.5px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 120ms ease;
  }

  .tb-note-chip:hover {
    background: rgba(125, 229, 255, 0.16);
  }

  .tb-note-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tb-link-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
    padding: 2px;
  }

  .tb-note-viewer-body {
    max-height: 55vh;
    overflow-y: auto;
    padding: 4px 2px;
  }

  /* ---- Composer estilo Trello ---------------------------------------------- */
  .tb-add-open {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px dashed rgba(255, 255, 255, 0.14);
    background: transparent;
    color: #8b8c96;
    font-size: 11.5px;
    cursor: pointer;
    transition: color 120ms ease, border-color 120ms ease;
  }

  .tb-add-open:hover {
    color: #e6e6eb;
    border-color: rgba(255, 255, 255, 0.3);
  }

  .tb-composer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(91, 141, 239, 0.35);
    background: rgba(91, 141, 239, 0.06);
  }

  .tb-composer input,
  .tb-composer textarea,
  .tb-desc-edit {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 7px;
    background: rgba(13, 11, 46, 0.6);
    color: #e6e6eb;
    font-size: 12px;
    font-family: inherit;
    padding: 6px 9px;
    outline: none;
    resize: vertical;
  }

  .tb-composer input:focus,
  .tb-composer textarea:focus,
  .tb-desc-edit:focus {
    border-color: rgba(91, 141, 239, 0.55);
  }

  .tb-staged {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tb-staged-thumb {
    position: relative;
    width: 52px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .tb-staged-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .tb-staged-x {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 9px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tb-composer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tb-spacer {
    flex: 1;
  }

  .tb-cancel {
    border: none;
    background: transparent;
    color: #8b8c96;
    font-size: 11px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .tb-cancel:hover {
    color: #e6e6eb;
    background: rgba(255, 255, 255, 0.06);
  }

  /* ---- Descricao markdown no cartao ------------------------------------------ */
  .tb-desc {
    margin: 2px 6px 0;
    padding: 6px 8px;
    border-radius: 7px;
    background: rgba(13, 11, 46, 0.45);
    max-height: 130px;
    overflow-y: auto;
    cursor: text;
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
