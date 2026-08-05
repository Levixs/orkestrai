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
  import * as Dialog from '$lib/components/ui/dialog';

  type Workspace = { id: string; name: string };
  type SkillResult = { id: string; skillId: string; name: string; source: string; installs: number };
  type InstalledSkill = { skillId: string; name: string; description: string };

  // -- MCPs (marketplace: curadoria + registry oficial) ------------------------
  type McpEnvVar = { key: string; label: string; help?: string; required?: boolean };
  type McpEntry = {
    key: string;
    title: string;
    description: string;
    source: 'curadoria' | 'registry';
    category: string;
    official: boolean;
    homepage?: string;
    url?: string;
    command?: string;
    args?: string[];
    envs?: McpEnvVar[];
  };
  type McpServer = { name: string; command: string; args: string[]; env: Record<string, string>; url?: string; builtin: boolean };

  let tab = $state<'skills' | 'mcps'>('skills');
  let mcpQuery = $state('');
  let mcpResults = $state<McpEntry[]>([]);
  let mcpSearching = $state(false);
  let mcpFeedback = $state('');
  let installedMcps = $state<McpServer[]>([]);
  let mcpInstallEntry = $state<McpEntry | null>(null);
  let mcpEnvValues = $state<Record<string, string>>({});
  let mcpInstalling = $state(false);
  let mcpInstallError = $state('');

  async function loadInstalledMcps() {
    if (!workspaceId) {
      installedMcps = [];
      return;
    }
    installedMcps = await api<McpServer[]>(`/api/agent-room/workspaces/${workspaceId}/mcps`).catch(() => []);
  }

  async function searchMcps() {
    mcpSearching = true;
    mcpFeedback = '';
    try {
      mcpResults = await api<McpEntry[]>(`/api/agent-room/workspaces/${workspaceId || 'x'}/mcp-market?q=${encodeURIComponent(mcpQuery.trim())}`);
      if (!mcpResults.length) mcpFeedback = 'Nenhum MCP encontrado.';
    } catch (error) {
      mcpFeedback = error instanceof Error ? error.message : 'Falha na busca.';
      mcpResults = [];
    } finally {
      mcpSearching = false;
    }
  }

  function isMcpInstalled(entry: McpEntry) {
    return installedMcps.some((server) => server.name === entry.key);
  }

  /** Abre a instalacao: direto se nao pede env; dialog com campos se pede. */
  function openMcpInstall(entry: McpEntry) {
    if (!workspaceId) {
      mcpFeedback = 'Escolha um workspace para instalar.';
      return;
    }
    mcpInstallError = '';
    mcpEnvValues = {};
    if ((entry.envs ?? []).some((env) => env.required)) {
      mcpInstallEntry = entry;
      return;
    }
    void confirmMcpInstall(entry);
  }

  async function confirmMcpInstall(entry: McpEntry) {
    mcpInstalling = true;
    mcpInstallError = '';
    mcpFeedback = '';
    try {
      installedMcps = await api<McpServer[]>(`/api/agent-room/workspaces/${workspaceId}/mcp-market`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entry, env: mcpEnvValues }),
      });
      mcpFeedback = `MCP "${entry.title}" instalado em ${activeWorkspaceName} — os agentes descobrem na proxima sessao.`;
      mcpInstallEntry = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao instalar.';
      if (mcpInstallEntry) mcpInstallError = message;
      else mcpFeedback = message;
    } finally {
      mcpInstalling = false;
    }
  }

  async function removeMcp(name: string) {
    installedMcps = await api<McpServer[]>(`/api/agent-room/workspaces/${workspaceId}/mcps?name=${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => installedMcps);
  }

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
    await Promise.all([loadInstalled(), loadInstalledMcps()]);
    // Catalogo de curadoria ja aparece antes da primeira busca.
    await searchMcps();
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
      <Select.Root type="single" value={workspaceId} onValueChange={async (value: string) => { workspaceId = value; await Promise.all([loadInstalled(), loadInstalledMcps()]); }}>
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

  <div class="tab-bar" role="tablist">
    <button class="tab-btn" class:active={tab === 'skills'} role="tab" aria-selected={tab === 'skills'} onclick={() => (tab = 'skills')}>
      <Blocks size={14} /> Skills
    </button>
    <button class="tab-btn" class:active={tab === 'mcps'} role="tab" aria-selected={tab === 'mcps'} onclick={() => (tab = 'mcps')}>
      <Search size={14} /> MCPs
    </button>
  </div>

  {#if tab === 'skills'}
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
  {:else}
    {#if installedMcps.length}
      <div class="installed-list">
        {#each installedMcps as server (server.name)}
          <div class="installed-item">
            <Search size={14} class="installed-icon" />
            <div class="installed-info">
              <span class="installed-name">{server.name}{server.builtin ? ' (da ponte)' : ''}</span>
              <span class="installed-desc">{server.url ?? `${server.command} ${server.args.join(' ')}`}</span>
            </div>
            {#if !server.builtin}
              <Button variant="ghost" size="sm" onclick={() => removeMcp(server.name)} aria-label={`Remover ${server.name}`}>
                <Trash2 size={13} />
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty-hint">Nenhum MCP instalado neste workspace (o da ponte vem sozinho).</p>
    {/if}
  {/if}
  </section>

  <Separator />

  {#if tab === 'skills'}
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
  {:else}
  <section class="skills-section">
    <h2>Buscar MCPs (curadoria + registry oficial)</h2>
    <form class="search-row" onsubmit={(event) => { event.preventDefault(); searchMcps(); }}>
      <Input bind:value={mcpQuery} placeholder="ex.: github, gmail, figma, drive, postgres..." class="search-input" />
      <Button type="submit" size="sm" disabled={mcpSearching}>
        {#if mcpSearching}<Spinner class="size-3.5" />{:else}<Search size={14} />{/if}
        Buscar
      </Button>
    </form>

    {#if mcpFeedback}<p class="feedback">{mcpFeedback}</p>{/if}

    {#if mcpSearching}
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
    {:else if mcpResults.length}
      <div class="results-list">
        {#each mcpResults as entry (entry.key + entry.title)}
          <div class="result-item">
            <div class="result-info">
              <div class="result-title">
                <span class="result-name">{entry.title}</span>
                {#if entry.official}<Badge variant="secondary">oficial</Badge>{/if}
                <Badge variant="outline">{entry.source === 'curadoria' ? 'curadoria' : 'registry'}</Badge>
                {#if entry.url}<Badge variant="outline">1 clique</Badge>{/if}
              </div>
              <span class="result-desc">{entry.description}</span>
              <span class="result-source">{entry.url ?? `${entry.command ?? ''} ${(entry.args ?? []).join(' ')}`.trim()}</span>
            </div>
            {#if isMcpInstalled(entry)}
              <Badge variant="outline">Instalado</Badge>
            {:else}
              <Button variant="outline" size="sm" disabled={!workspaceId || mcpInstalling} onclick={() => openMcpInstall(entry)}>
                <Download size={13} />
                Instalar
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
  {/if}
</main>

{#if mcpInstallEntry}
  <Dialog.Root open={mcpInstallEntry !== null} onOpenChange={(open: boolean) => !open && (mcpInstallEntry = null)}>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>Instalar {mcpInstallEntry.title}</Dialog.Title>
        <Dialog.Description>
          Preencha para ativar o MCP neste workspace.
          {#if mcpInstallEntry.homepage}
            {' '}<a class="mcp-help-link" href={mcpInstallEntry.homepage} target="_blank" rel="noreferrer">onde conseguir →</a>
          {/if}
        </Dialog.Description>
      </Dialog.Header>
      <div class="mcp-env-fields">
        {#each mcpInstallEntry.envs ?? [] as envVar (envVar.key)}
          <div class="mcp-env-field">
            <span class="field-label">{envVar.label}{envVar.required ? ' *' : ''}</span>
            <Input
              type="password"
              value={mcpEnvValues[envVar.key] ?? ''}
              oninput={(event: Event) => (mcpEnvValues = { ...mcpEnvValues, [envVar.key]: (event.target as HTMLInputElement).value })}
              placeholder={envVar.key}
            />
            {#if envVar.help}<span class="mcp-env-help">{envVar.help}</span>{/if}
          </div>
        {/each}
        {#if mcpInstallError}
          <p class="mcp-install-error">{mcpInstallError}</p>
        {/if}
      </div>
      <Dialog.Footer>
        <Button variant="outline" onclick={() => (mcpInstallEntry = null)}>Cancelar</Button>
        <Button disabled={mcpInstalling} onclick={() => mcpInstallEntry && confirmMcpInstall(mcpInstallEntry)}>
          {mcpInstalling ? 'Instalando...' : 'Instalar'}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}

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

  /* ---- Abas Skills/MCPs --------------------------------------------------- */
  .tab-bar {
    display: flex;
    gap: 6px;
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: transparent;
    color: #a9aab3;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .tab-btn.active {
    background: rgba(91, 141, 239, 0.18);
    border-color: rgba(91, 141, 239, 0.5);
    color: #fff;
  }

  .result-desc {
    font-size: 11.5px;
    color: #a9aab3;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .mcp-env-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 0;
  }

  .mcp-env-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .mcp-env-help {
    font-size: 10.5px;
    color: #6d6d78;
  }

  .mcp-help-link {
    color: #7de5ff;
  }

  .mcp-install-error {
    margin: 0;
    font-size: 12px;
    color: #ff9c9f;
  }
</style>
