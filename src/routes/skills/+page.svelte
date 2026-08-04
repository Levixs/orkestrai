<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Blocks, Download, Search, Trash2 } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Select from '$lib/components/ui/select';
  import { Separator } from '$lib/components/ui/separator';
  import { Badge } from '$lib/components/ui/badge';
  import { Spinner } from '$lib/components/ui/spinner';
  import { Skeleton } from '$lib/components/ui/skeleton';

  type Workspace = { id: string; name: string };
  type SkillResult = { id: string; skillId: string; name: string; source: string; installs: number };
  type InstalledSkill = { skillId: string; name: string; description: string };

  let workspaces = $state<Workspace[]>([]);
  let workspaceId = $state('');
  let query = $state('');
  let results = $state<SkillResult[]>([]);
  let installed = $state<InstalledSkill[]>([]);
  let searching = $state(false);
  let installingId = $state<string | null>(null);
  let feedback = $state('');

  const activeWorkspaceName = $derived(workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? '');

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) throw new Error(payload.error || `Erro ${response.status}`);
    return payload.data as T;
  }

  async function loadInstalled() {
    if (!workspaceId) {
      installed = [];
      return;
    }
    installed = await api<InstalledSkill[]>(`/api/agent-room/workspaces/${workspaceId}/skills`).catch(() => []);
  }

  async function search() {
    if (!query.trim()) return;
    searching = true;
    feedback = '';
    try {
      results = await api<SkillResult[]>(`/api/agent-room/skills/search?q=${encodeURIComponent(query.trim())}`);
      if (!results.length) feedback = 'Nenhuma skill encontrada.';
    } catch (error) {
      feedback = error instanceof Error ? error.message : 'Falha na busca.';
      results = [];
    } finally {
      searching = false;
    }
  }

  async function install(skill: SkillResult) {
    if (!workspaceId) {
      feedback = 'Escolha um workspace para instalar.';
      return;
    }
    installingId = skill.id;
    feedback = '';
    try {
      await api(`/api/agent-room/workspaces/${workspaceId}/skills`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: skill.source, skillId: skill.skillId }),
      });
      await loadInstalled();
      feedback = `Skill "${skill.name}" instalada em ${activeWorkspaceName}. Os agentes descobrem na proxima sessao.`;
    } catch (error) {
      feedback = error instanceof Error ? error.message : 'Falha ao instalar.';
    } finally {
      installingId = null;
    }
  }

  async function uninstall(skillId: string) {
    feedback = '';
    try {
      await api(`/api/agent-room/workspaces/${workspaceId}/skills/${skillId}`, { method: 'DELETE' });
      await loadInstalled();
    } catch (error) {
      feedback = error instanceof Error ? error.message : 'Falha ao remover.';
    }
  }

  function isInstalled(skill: SkillResult) {
    return installed.some((item) => item.skillId === skill.skillId);
  }

  function formatInstalls(count: number) {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
    return String(count);
  }

  onMount(async () => {
    document.documentElement.classList.add('dark');
    workspaces = await api<Workspace[]>('/api/agent-room/workspaces').catch(() => []);
    const fromUrl = new URLSearchParams(location.search).get('workspace');
    workspaceId = fromUrl && workspaces.some((workspace) => workspace.id === fromUrl) ? fromUrl : (workspaces[0]?.id ?? '');
    await loadInstalled();
  });
</script>

<svelte:head>
  <title>Orkestrai — Skills</title>
</svelte:head>

<main class="skills-page">
  <header class="skills-header">
    <Button variant="ghost" size="sm" href="/canvas">
      <ArrowLeft size={15} />
      Canvas
    </Button>
    <div>
      <h1>Skills</h1>
      <p>Busque no registry skills.sh e instale no workspace — os agentes usam na proxima sessao.</p>
    </div>
  </header>

  <section class="skills-section">
    <h2>Workspace</h2>
    <div class="field">
      <span class="field-label">Instalar em</span>
      <Select.Root type="single" value={workspaceId} onValueChange={async (value: string) => { workspaceId = value; await loadInstalled(); }}>
        <Select.Trigger class="w-64" data-slot="select-trigger">
          {activeWorkspaceName || 'Escolha um workspace'}
        </Select.Trigger>
        <Select.Content>
          {#each workspaces as workspace (workspace.id)}
            <Select.Item value={workspace.id}>{workspace.name}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    {#if installed.length}
      <div class="installed-list">
        {#each installed as skill (skill.skillId)}
          <div class="installed-item">
            <Blocks size={14} class="installed-icon" />
            <div class="installed-info">
              <span class="installed-name">{skill.name}</span>
              {#if skill.description}<span class="installed-desc">{skill.description}</span>{/if}
            </div>
            <Button variant="ghost" size="sm" onclick={() => uninstall(skill.skillId)} aria-label={`Remover ${skill.name}`}>
              <Trash2 size={13} />
            </Button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty-hint">Nenhuma skill instalada neste workspace.</p>
    {/if}
  </section>

  <Separator />

  <section class="skills-section">
    <h2>Buscar no skills.sh</h2>
    <form class="search-row" onsubmit={(event) => { event.preventDefault(); search(); }}>
      <Input bind:value={query} placeholder="ex.: web design, react, seo, postgres..." class="search-input" />
      <Button type="submit" size="sm" disabled={searching || !query.trim()}>
        {#if searching}<Spinner class="size-3.5" />{:else}<Search size={14} />{/if}
        Buscar
      </Button>
    </form>

    {#if feedback}<p class="feedback">{feedback}</p>{/if}

    {#if searching}
      <div class="results-list" aria-hidden="true">
        {#each [0, 1, 2, 3] as index (index)}
          <div class="result-item">
            <div class="result-info result-skeleton">
              <Skeleton class="h-4 w-40 bg-white/8" />
              <Skeleton class="h-3 w-56 bg-white/8" />
            </div>
            <Skeleton class="h-8 w-20 bg-white/8" />
          </div>
        {/each}
      </div>
    {:else if results.length}
      <div class="results-list">
        {#each results as skill (skill.id)}
          <div class="result-item">
            <div class="result-info">
              <div class="result-title">
                <span class="result-name">{skill.name}</span>
                <Badge variant="secondary">{formatInstalls(skill.installs)} instalacoes</Badge>
              </div>
              <span class="result-source">{skill.id}</span>
            </div>
            {#if isInstalled(skill)}
              <Badge variant="outline">Instalada</Badge>
            {:else}
              <Button variant="outline" size="sm" disabled={installingId === skill.id || !workspaceId} onclick={() => install(skill)}>
                {#if installingId === skill.id}<Spinner class="size-3.5" />{:else}<Download size={13} />{/if}
                Instalar
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  .skills-page {
    min-height: 100vh;
    background: #0D0B2E;
    color: #e6e6eb;
    padding: 28px 20px 60px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
  }

  .skills-page > * {
    width: min(680px, 100%);
  }

  .result-skeleton {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skills-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .skills-header h1 {
    font-size: 17px;
    margin: 0;
  }

  .skills-header p {
    margin: 0;
    font-size: 12px;
    color: #6d6d78;
  }

  .skills-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
    background: #1C1946;
    padding: 20px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .skills-section h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #8b8c96;
    margin: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 12px;
    color: #8b8c96;
  }

  .search-row {
    display: flex;
    gap: 8px;
  }

  .search-input {
    flex: 1;
  }

  .feedback {
    margin: 0;
    font-size: 12px;
    color: #ffc857;
  }

  .empty-hint {
    margin: 0;
    font-size: 12px;
    color: #6d6d78;
  }

  .results-list, .installed-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .result-item, .installed-item {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.02);
  }

  .result-info, .installed-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .result-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .result-name, .installed-name {
    font-size: 13px;
    font-weight: 500;
    color: #e6e6eb;
  }

  .result-source, .installed-desc {
    font-size: 11px;
    color: #6d6d78;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.installed-icon) {
    color: #7c4dff;
    flex-shrink: 0;
  }
</style>
