<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { Braces, Code2, Link2, LoaderCircle, RefreshCw, TriangleAlert, Unlink2 } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import type {
    DesignComponent,
    DesignDocument,
    DesignOperation,
    DesignVariable,
    DesignVariableType,
    DesignVariableValue,
  } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
  import type {
    DesignCodebaseScan,
    DesignCodeComponentCandidate,
    DesignCodeTokenCandidate,
  } from '$lib/modules/agent-room/contracts/schemas/designCodebaseSchemas.js';
  import * as m from '$lib/paraglide/messages.js';

  let {
    document,
    activeComponent,
    saving,
    makeId,
    onApply,
  }: {
    document: DesignDocument;
    activeComponent: DesignComponent | null;
    saving: boolean;
    makeId: () => string;
    onApply: (operations: DesignOperation[], summary: string, inverse: DesignOperation[]) => Promise<boolean>;
  } = $props();

  let scan = $state<DesignCodebaseScan | null>(null);
  let loading = $state(false);
  let search = $state('');
  let busyPath = $state('');

  const tokenSources = $derived(scan ? [...new Set(scan.tokens.map((token) => token.path))].sort() : []);
  const components = $derived(scan?.components.filter((component) => `${component.name} ${component.path}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) ?? []);
  const linkedCandidate = $derived(activeComponent?.codeConnect && scan
    ? scan.components.find((candidate) => candidate.path === activeComponent.codeConnect?.path && candidate.exportName === activeComponent.codeConnect?.exportName) ?? null
    : null);
  const linkedStatus = $derived(!activeComponent?.codeConnect
    ? 'none'
    : !linkedCandidate
      ? 'missing'
      : linkedCandidate.hash === activeComponent.codeConnect.hash
        ? 'current'
        : 'changed');

  async function scanCodebase() {
    loading = true;
    try {
      const response = await fetch(`/api/agent-room/workspaces/${document.workspaceId}/design-system/scan`);
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error('scan');
      scan = payload.data;
    } catch {
      toast.error(m['design.codebase_scan_error']());
    } finally {
      loading = false;
    }
  }

  function variableValue(candidate: DesignCodeTokenCandidate, ids: Map<string, string>): DesignVariableValue {
    if (candidate.aliasKey && ids.has(candidate.aliasKey)) return { kind: 'alias', variableId: ids.get(candidate.aliasKey)! };
    if (candidate.type === 'color') return { kind: 'color', value: String(candidate.value) };
    if (candidate.type === 'boolean') return { kind: 'boolean', value: Boolean(candidate.value) };
    if (candidate.type === 'string') return { kind: 'string', value: String(candidate.value) };
    return { kind: 'number', value: Number(candidate.value) };
  }

  function buildTokenSync(path: string, newCollectionOffset = 0): { operations: DesignOperation[]; inverse: DesignOperation[] } {
    if (!scan) return { operations: [], inverse: [] };
    const candidates = scan.tokens.filter((token) => token.path === path);
    if (!candidates.length) return { operations: [], inverse: [] };
    const existingCollection = document.variableCollections.find((collection) => collection.codeSource?.path === path);
    const collectionId = existingCollection?.id ?? makeId();
    const modeId = existingCollection?.defaultModeId ?? makeId();
    const ids = new Map(candidates.map((candidate) => {
      const existing = document.variables.find((variable) => variable.collectionId === collectionId && variable.codeSourceKey === candidate.key);
      return [candidate.key, existing?.id ?? makeId()];
    }));
    const syncedAt = new Date().toISOString();
    const source = { path, format: candidates[0].format, hash: candidates[0].hash, syncedAt } as const;
    const operations: DesignOperation[] = [];
    const inverse: DesignOperation[] = [];
    const candidateKeys = new Set(candidates.map((candidate) => candidate.key));
    const staleVariables = existingCollection
      ? document.variables.filter((variable) => variable.collectionId === existingCollection.id && variable.codeSourceKey && !candidateKeys.has(variable.codeSourceKey))
      : [];
    const staleIds = new Set(staleVariables.map((variable) => variable.id));
    const restoreStale: DesignOperation[] = [
      ...staleVariables.map((variable) => ({ kind: 'add-variable' as const, variable })),
      ...document.variables
        .filter((variable) => Object.values(variable.values).some((value) => value.kind === 'alias' && staleIds.has(value.variableId)))
        .map((variable) => ({ kind: 'update-variable' as const, variableId: variable.id, changes: { values: variable.values } })),
      ...document.elements.flatMap((element) => Object.entries(element.variableBindings)
        .filter(([, variableId]) => staleIds.has(variableId))
        .map(([property, variableId]) => ({ kind: 'bind-variable', elementId: element.id, property, variableId }) as DesignOperation)),
    ];
    if (existingCollection) {
      operations.push({ kind: 'update-variable-collection', collectionId, changes: { codeSource: source } });
      inverse.unshift({ kind: 'update-variable-collection', collectionId, changes: { codeSource: existingCollection.codeSource } });
    } else {
      const name = path.split('/').at(-1)?.replace(/\.[^.]+$/, '') || m['design.code_tokens']();
      operations.push({ kind: 'add-variable-collection', collection: {
        id: collectionId,
        name: `${m['design.code']()} · ${name}`,
        modes: [{ id: modeId, name: m['design.default_mode']() }],
        defaultModeId: modeId,
        order: document.variableCollections.length + newCollectionOffset,
        libraryId: null,
        librarySourceId: null,
        codeSource: source,
      } });
      inverse.unshift({ kind: 'delete-variable-collection', collectionId });
    }
    for (const [index, candidate] of candidates.entries()) {
      const existing = document.variables.find((variable) => variable.id === ids.get(candidate.key));
      const variable: DesignVariable = {
        id: ids.get(candidate.key)!,
        collectionId,
        name: candidate.name,
        type: candidate.type as DesignVariableType,
        description: path,
        values: { [modeId]: variableValue(candidate, ids) },
        order: existing?.order ?? index,
        libraryId: null,
        librarySourceId: null,
        codeSourceKey: candidate.key,
      };
      if (existing) {
        const { id: _id, ...changes } = variable;
        const { id: _existingId, ...previous } = existing;
        operations.push({ kind: 'update-variable', variableId: existing.id, changes });
        inverse.unshift({ kind: 'update-variable', variableId: existing.id, changes: previous });
      } else {
        operations.push({ kind: 'add-variable', variable });
        inverse.unshift({ kind: 'delete-variable', variableId: variable.id });
      }
    }
    for (const variable of staleVariables) operations.push({ kind: 'delete-variable', variableId: variable.id });
    return { operations, inverse: [...restoreStale, ...inverse] };
  }

  async function syncTokens(path: string) {
    const plan = buildTokenSync(path);
    if (!plan.operations.length) return;
    busyPath = path;
    try {
      await onApply(plan.operations, m['design.operation_sync_code_tokens']({ path }), plan.inverse);
    } finally {
      busyPath = '';
    }
  }

  async function syncAllTokens() {
    const plans = tokenSources.map((path, index) => buildTokenSync(path, index));
    const operations = plans.flatMap((plan) => plan.operations);
    const inverse = plans.slice().reverse().flatMap((plan) => plan.inverse);
    if (!operations.length) return;
    busyPath = '*';
    try {
      await onApply(operations, m['design.operation_sync_all_code_tokens'](), inverse);
    } finally {
      busyPath = '';
    }
  }

  async function connectComponent(candidate: DesignCodeComponentCandidate) {
    if (!activeComponent) return;
    const previous = activeComponent.codeConnect;
    const codeConnect = {
      path: candidate.path,
      framework: candidate.framework,
      exportName: candidate.exportName,
      props: candidate.props,
      hash: candidate.hash,
      syncedAt: new Date().toISOString(),
    };
    await onApply(
      [{ kind: 'update-component', componentId: activeComponent.id, changes: { codeConnect, updatedAt: new Date().toISOString() } }],
      m['design.operation_connect_code_component']({ name: activeComponent.name }),
      [{ kind: 'update-component', componentId: activeComponent.id, changes: { codeConnect: previous, updatedAt: activeComponent.updatedAt } }],
    );
  }

  async function disconnectComponent() {
    if (!activeComponent?.codeConnect) return;
    await onApply(
      [{ kind: 'update-component', componentId: activeComponent.id, changes: { codeConnect: null, updatedAt: new Date().toISOString() } }],
      m['design.operation_disconnect_code_component']({ name: activeComponent.name }),
      [{ kind: 'update-component', componentId: activeComponent.id, changes: { codeConnect: activeComponent.codeConnect, updatedAt: activeComponent.updatedAt } }],
    );
  }

  onMount(() => void scanCodebase());
</script>

<div class="flex h-full min-h-0 flex-col text-[11px]">
  <div class="space-y-2 border-b border-[var(--app-border)] p-2">
    <div class="flex items-center justify-between"><span class="text-[9px] font-semibold uppercase text-[var(--app-text-muted)]">{m['design.codebase_design_system']()}</span><Button variant="ghost" size="icon-sm" class="size-6" aria-label={m['design.scan_codebase']()} onclick={() => void scanCodebase()}><RefreshCw size={12} class={loading ? 'animate-spin' : ''} /></Button></div>
    {#if scan}<div class="grid grid-cols-3 gap-1 text-center text-[9px]"><div><strong class="block text-sm text-[var(--app-text)]">{scan.files.length}</strong>{m['design.code_files']()}</div><div><strong class="block text-sm text-[var(--app-text)]">{scan.tokens.length}</strong>{m['design.tokens']()}</div><div><strong class="block text-sm text-[var(--app-text)]">{scan.components.length}</strong>{m['design.components']()}</div></div>{/if}
    <Button class="w-full" variant="secondary" size="sm" disabled={!tokenSources.length || busyPath === '*'} onclick={() => void syncAllTokens()}>{#if busyPath === '*'}<LoaderCircle size={12} class="animate-spin" />{:else}<Braces size={12} />{/if}{m['design.sync_all_tokens']()}</Button>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if loading && !scan}<div class="grid h-32 place-items-center"><LoaderCircle size={17} class="animate-spin text-[var(--app-accent)]" /></div>
    {:else if scan}
      <section class="border-b border-[var(--app-border)] p-2"><div class="mb-1.5 text-[9px] font-semibold uppercase text-[var(--app-text-muted)]">{m['design.code_token_sources']()}</div><div class="space-y-1">{#each tokenSources as path (path)}{@const collection = document.variableCollections.find((candidate) => candidate.codeSource?.path === path)}<div class="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-[var(--app-surface-raised)]"><Braces size={11} class="shrink-0 text-[var(--app-accent)]" /><span class="min-w-0 flex-1 truncate">{path}</span><Button variant="ghost" size="sm" class="h-6 px-1.5 text-[9px]" disabled={busyPath === path} onclick={() => void syncTokens(path)}>{collection ? m['design.sync']() : m['design.import']()}</Button></div>{/each}</div></section>
      <section class="p-2"><div class="mb-1.5 text-[9px] font-semibold uppercase text-[var(--app-text-muted)]">{m['design.code_components']()}</div><div class="relative mb-2"><Code2 size={11} class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[var(--app-text-muted)]" /><Input class="pl-7" placeholder={m['design.search_code_components']()} bind:value={search} /></div>
        {#if activeComponent?.codeConnect}<div class="mb-2 border border-[var(--app-accent)]/30 bg-[var(--app-accent-soft)] p-2"><div class="flex items-start gap-2"><Link2 size={12} class="mt-0.5 text-[var(--app-accent)]" /><div class="min-w-0 flex-1"><p class="truncate font-medium">{activeComponent.codeConnect.exportName}</p><p class="truncate text-[9px] text-[var(--app-text-muted)]">{activeComponent.codeConnect.path}</p>{#if linkedStatus === 'changed'}<p class="mt-1 flex items-center gap-1 text-[9px] text-[var(--app-warning)]"><TriangleAlert size={10} />{m['design.code_source_changed']()}</p>{:else if linkedStatus === 'missing'}<p class="mt-1 flex items-center gap-1 text-[9px] text-[var(--app-danger)]"><TriangleAlert size={10} />{m['design.code_source_missing']()}</p>{/if}</div>{#if linkedStatus === 'changed' && linkedCandidate}<Button variant="ghost" size="icon-sm" class="size-6" aria-label={m['design.sync_code_component']()} title={m['design.sync_code_component']()} onclick={() => void connectComponent(linkedCandidate)}><RefreshCw size={11} /></Button>{/if}<Button variant="ghost" size="icon-sm" class="size-6" aria-label={m['design.disconnect_code_component']()} onclick={() => void disconnectComponent()}><Unlink2 size={11} /></Button></div></div>{/if}
        <div class="space-y-1">{#each components as candidate (candidate.key)}<div class="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-[var(--app-surface-raised)]"><Code2 size={11} class="shrink-0 text-[var(--app-text-muted)]" /><button class="min-w-0 flex-1 text-left" disabled={!activeComponent || saving} onclick={() => void connectComponent(candidate)}><span class="block truncate">{candidate.name}</span><span class="block truncate text-[8px] text-[var(--app-text-muted)]">{candidate.path} · {m['design.code_props']({ count: String(candidate.props.length) })}</span></button>{#if activeComponent?.codeConnect?.path === candidate.path}<span class="text-[8px] text-[var(--app-accent)]">{m['design.connected']()}</span>{/if}</div>{/each}</div>
      </section>
    {:else}<div class="p-3 text-[10px] text-[var(--app-text-muted)]">{m['design.codebase_scan_error']()}</div>{/if}
  </div>
</div>
