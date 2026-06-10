<script lang="ts">
  import { Folder, FolderPlus, XCircle } from '@lucide/svelte';
  import type { ProjectInfo } from '$lib/modules/agent-room/domain/types.js';

  let {
    projects,
    selectedProjectPath = $bindable<string | null>(null),
    busy = false,
    onCreateProject,
  }: {
    projects: ProjectInfo[];
    selectedProjectPath: string | null;
    busy?: boolean;
    onCreateProject: (name: string) => void;
  } = $props();

  let projectName = $state('');
  let status = $state('Aguardando etapa');
  let latestFiles = $state<string[]>([]);

  function create() {
    const name = projectName.trim();
    if (!name) return;
    onCreateProject(name);
    projectName = '';
    status = 'Projeto criado';
    latestFiles = ['Pasta do projeto'];
  }
</script>

<aside class="project-panel">
  <header>
    <Folder size={18} />
    <div>
      <strong>Projeto</strong>
      <span>{status}</span>
    </div>
  </header>

  <label>
    <span>Pasta atual</span>
    <select bind:value={selectedProjectPath}>
      <option value={null}>Sem projeto</option>
      {#each projects as project}
        <option value={project.path}>{project.name}</option>
      {/each}
    </select>
  </label>

  <div class="project-create">
    <input bind:value={projectName} placeholder="nome-do-projeto" disabled={busy} />
    <button type="button" onclick={create} disabled={busy || !projectName.trim()} aria-label="Criar projeto">
      <FolderPlus size={16} />
    </button>
  </div>

  <div class="file-list">
    <span>Ultimos arquivos alterados</span>
    {#if latestFiles.length}
      {#each latestFiles as file}
        <code>{file}</code>
      {/each}
    {:else}
      <em>Nenhuma alteracao registrada pela UI.</em>
    {/if}
  </div>

  <div class="approval-actions">
    <button type="button" onclick={() => (status = 'Etapa aprovada')}>
      Aprovar etapa
    </button>
    <button type="button" onclick={() => (status = 'Etapa recusada')}>
      <XCircle size={15} />
      Recusar
    </button>
  </div>
</aside>
