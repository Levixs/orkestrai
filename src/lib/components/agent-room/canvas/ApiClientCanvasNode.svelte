<script lang="ts">
  import { Braces, Check, ChevronDown, ExternalLink, FileJson2, FolderOpen, LoaderCircle, Plus, Send, Trash2 } from '@lucide/svelte';
  import { getCsrfToken } from '@beeblock/svelar/http';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as NativeSelect from '$lib/components/ui/native-select';
  import * as Tabs from '$lib/components/ui/tabs';
  import NodeShell from './NodeShell.svelte';
  import type { ApiClientHeader, ApiClientNodePayload, ApiClientRequest } from '$lib/modules/agent-room/domain/types.js';
  import * as m from '$lib/paraglide/messages.js';

  export type ApiClientNodeData = {
    title: string;
    workspaceId: string;
    payload: ApiClientNodePayload;
    onPayloadChange?: (id: string, partial: Record<string, unknown>) => void;
    onRename?: (id: string, title: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    connections?: Array<{ edgeId: string; nodeId: string; title: string; type: string }>;
    onJumpToNode?: (id: string) => void;
    onRemoveConnection?: (edgeId: string) => void;
  };

  type ApiResponse = {
    status: number;
    statusText: string;
    ok: boolean;
    durationMs: number;
    size: number;
    contentType: string;
    headers: Record<string, string>;
    body: string;
    binary: boolean;
  };

  type DesktopBridge = {
    pickDirectory?: () => Promise<string | null>;
    pickApiCollection?: (kind: 'bruno' | 'postman') => Promise<string | null>;
    openApiCollection?: (kind: 'bruno' | 'postman', path: string) => Promise<boolean>;
  };

  let { id, data, selected } = $props<{ id: string; data: ApiClientNodeData; selected?: boolean }>();
  let requests = $state<ApiClientRequest[]>([]);
  let selectedRequestId = $state<string | null>(null);
  let variables = $state<Record<string, string>>({});
  let activeTab = $state('body');
  let sending = $state(false);
  let importing = $state(false);
  let error = $state('');
  let response = $state<ApiResponse | null>(null);
  const selectedRequest = $derived(requests.find((request) => request.id === selectedRequestId) ?? null);
  const desktop = $derived(
    typeof window === 'undefined'
      ? undefined
      : (window as typeof window & { orkestraiDesktop?: DesktopBridge }).orkestraiDesktop
  );

  $effect(() => {
    const payload = data.payload;
    const clonedRequests = structuredClone(payload.requests ?? []) as ApiClientRequest[];
    const nextRequests: ApiClientRequest[] = clonedRequests.map((request: ApiClientRequest) => ({
      ...request,
      auth: request.auth ?? { type: 'none', token: '', username: '', password: '' },
    }));
    requests = nextRequests;
    selectedRequestId = payload.selectedRequestId ?? nextRequests[0]?.id ?? null;
    variables = structuredClone(payload.variables ?? {});
  });

  function inputValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement).value;
  }

  function persist() {
    data.onPayloadChange?.(id, { requests, selectedRequestId, variables });
  }

  function chooseRequest(requestId: string) {
    selectedRequestId = requestId;
    response = null;
    error = '';
    data.onPayloadChange?.(id, { selectedRequestId });
  }

  function updateRequest(changes: Partial<ApiClientRequest>, persistNow = false) {
    if (!selectedRequest) return;
    requests = requests.map((request) => request.id === selectedRequest.id ? { ...request, ...changes } : request);
    if (persistNow) persist();
  }

  function addRequest() {
    const request: ApiClientRequest = {
      id: crypto.randomUUID(),
      name: m['api_client.new_request'](),
      method: 'GET',
      url: '',
      headers: [],
      auth: { type: 'none', token: '', username: '', password: '' },
      body: '',
      bodyMode: 'none',
      sourcePath: null,
    };
    requests = [...requests, request];
    selectedRequestId = request.id;
    persist();
  }

  function deleteRequest() {
    if (!selectedRequest) return;
    requests = requests.filter((request) => request.id !== selectedRequest.id);
    selectedRequestId = requests[0]?.id ?? null;
    response = null;
    persist();
  }

  function addHeader() {
    if (!selectedRequest) return;
    updateRequest({ headers: [...selectedRequest.headers, { id: crypto.randomUUID(), name: '', value: '', enabled: true }] }, true);
  }

  function updateHeader(headerId: string, changes: Partial<ApiClientHeader>, persistNow = false) {
    if (!selectedRequest) return;
    updateRequest({
      headers: selectedRequest.headers.map((header) => header.id === headerId ? { ...header, ...changes } : header),
    }, persistNow);
  }

  function removeHeader(headerId: string) {
    if (!selectedRequest) return;
    updateRequest({ headers: selectedRequest.headers.filter((header) => header.id !== headerId) }, true);
  }

  function addVariable() {
    let index = Object.keys(variables).length + 1;
    while (`variable${index}` in variables) index += 1;
    variables = { ...variables, [`variable${index}`]: '' };
    persist();
  }

  function renameVariable(oldName: string, newName: string) {
    const normalized = newName.trim();
    if (!normalized || normalized === oldName || normalized in variables) return;
    const next: Record<string, string> = {};
    for (const [name, value] of Object.entries(variables)) next[name === oldName ? normalized : name] = value;
    variables = next;
    persist();
  }

  function displayBody(value: string) {
    if (!value) return '';
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }

  function bodyModeLabel(mode: string) {
    if (mode === 'json') return m['api_client.body_json']();
    if (mode === 'text') return m['api_client.body_text']();
    if (mode === 'xml') return m['api_client.body_xml']();
    if (mode === 'form') return m['api_client.body_form']();
    return m['api_client.body_none']();
  }

  async function sendRequest() {
    if (!selectedRequest || !selectedRequest.url.trim() || sending) return;
    sending = true;
    error = '';
    response = null;
    try {
      const csrf = getCsrfToken();
      const result = await fetch(`/api/agent-room/workspaces/${data.workspaceId}/api-client/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        body: JSON.stringify({ nodeId: id, request: selectedRequest, variables }),
      });
      const payload = await result.json().catch(() => ({}));
      if (!result.ok || payload.error) throw new Error(payload.error || m['api_client.request_failed']());
      response = payload.data;
      activeTab = 'response';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : m['api_client.request_failed']();
    } finally {
      sending = false;
    }
  }

  async function importCollection(kind: 'bruno' | 'postman') {
    if (importing) return;
    let path = kind === 'bruno'
      ? await desktop?.pickDirectory?.()
      : await desktop?.pickApiCollection?.('postman');
    if (!path && kind === 'bruno') path = await desktop?.pickApiCollection?.('bruno');
    if (!path) return;
    importing = true;
    error = '';
    try {
      const csrf = getCsrfToken();
      const result = await fetch(`/api/agent-room/workspaces/${data.workspaceId}/api-client/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        body: JSON.stringify({ nodeId: id, kind, path }),
      });
      const payload = await result.json().catch(() => ({}));
      if (!result.ok || payload.error) throw new Error(payload.error || m['api_client.import_failed']());
      const imported = payload.data.payload as ApiClientNodePayload;
      requests = structuredClone(imported.requests ?? []);
      selectedRequestId = imported.selectedRequestId ?? requests[0]?.id ?? null;
      variables = structuredClone(imported.variables ?? {});
      data.onPayloadChange?.(id, imported as Record<string, unknown>);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : m['api_client.import_failed']();
    } finally {
      importing = false;
    }
  }

  async function openSource() {
    const kind = data.payload.sourceKind;
    const path = data.payload.sourcePath;
    if (!kind || !path) return;
    if (!await desktop?.openApiCollection?.(kind, path)) error = m['api_client.open_source_failed']();
  }
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-api-client"
  accent="var(--app-secondary)"
  minWidth={520}
  minHeight={360}
  onResize={data.onResize}
  connections={data.connections ?? []}
  titleText={data.title}
  onRename={data.onRename}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<Braces size={13} aria-hidden="true" />{/snippet}
  {#snippet title()}{data.title}{/snippet}
  {#snippet actions()}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="node-action-btn" aria-label={m['api_client.import']()} title={m['api_client.import']()} disabled={importing}>
        {#if importing}<LoaderCircle size={14} class="animate-spin" />{:else}<ChevronDown size={14} />{/if}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-52">
        <DropdownMenu.Item onclick={() => importCollection('bruno')}>
          <FolderOpen size={14} aria-hidden="true" /> {m['api_client.import_bruno']()}
        </DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => importCollection('postman')}>
          <FileJson2 size={14} aria-hidden="true" /> {m['api_client.import_postman']()}
        </DropdownMenu.Item>
        {#if data.payload.sourcePath}
          <DropdownMenu.Separator />
          <DropdownMenu.Item onclick={openSource}>
            <ExternalLink size={14} aria-hidden="true" /> {m['api_client.open_source']()}
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/snippet}

  <div class="grid h-full min-h-0 grid-cols-[180px_minmax(0,1fr)] overflow-hidden bg-[var(--app-surface)]">
    <aside class="flex min-h-0 flex-col border-r border-[var(--app-border)] bg-[var(--app-surface-subtle)]">
      <div class="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--app-border)] px-2">
        <span class="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase text-[var(--app-text-muted)]">{m['api_client.requests']()}</span>
        <button class="grid size-6 place-items-center rounded text-[var(--app-text-muted)] hover:bg-[var(--app-surface-raised)] hover:text-[var(--app-text)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]" aria-label={m['api_client.add_request']()} onclick={addRequest}>
          <Plus size={13} aria-hidden="true" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
        {#each requests as request (request.id)}
          <button
            class={`mb-0.5 flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--app-surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${request.id === selectedRequestId ? 'bg-[var(--app-surface-raised)]' : ''}`}
            aria-current={request.id === selectedRequestId ? 'true' : undefined}
            onclick={() => chooseRequest(request.id)}
          >
            <span class="w-9 shrink-0 text-[9px] font-bold text-[var(--app-secondary)]">{request.method}</span>
            <span class="min-w-0 flex-1 truncate text-[11px] text-[var(--app-text)]">{request.name}</span>
          </button>
        {:else}
          <div class="grid h-full place-items-center p-4 text-center text-[11px] leading-5 text-[var(--app-text-muted)]">
            <div>
              <Braces size={24} class="mx-auto mb-2 opacity-40" aria-hidden="true" />
              <p>{m['api_client.empty']()}</p>
              <Button size="sm" variant="outline" class="mt-3 h-7 text-[11px]" onclick={addRequest}><Plus size={13} /> {m['api_client.add_request']()}</Button>
            </div>
          </div>
        {/each}
      </div>
    </aside>

    {#if selectedRequest}
      <section class="flex min-h-0 min-w-0 flex-col">
        <div class="flex shrink-0 gap-1.5 border-b border-[var(--app-border)] p-2">
          <NativeSelect.Root
            class="w-[92px] shrink-0 [&_select]:font-bold [&_select]:text-[var(--app-secondary)]"
            size="sm"
            aria-label={m['api_client.method']()}
            value={selectedRequest.method}
            onchange={(event: Event) => updateRequest({ method: (event.currentTarget as HTMLSelectElement).value as ApiClientRequest['method'] }, true)}
          >
            {#each ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as method}
              <NativeSelect.Option value={method}>{method}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
          <Input
            value={selectedRequest.url}
            type="url"
            name="request-url"
            autocomplete="off"
            spellcheck="false"
            aria-label={m['api_client.url']()}
            placeholder={m['api_client.url_placeholder']()}
            class="h-8 min-w-0 flex-1 font-mono text-[11px]"
            oninput={(event: Event) => updateRequest({ url: inputValue(event) })}
            onblur={() => persist()}
            onkeydown={(event: KeyboardEvent) => event.key === 'Enter' && sendRequest()}
          />
          <Button size="sm" class="h-8 shrink-0 px-3 text-[11px]" disabled={sending || !selectedRequest.url.trim()} onclick={sendRequest}>
            {#if sending}<LoaderCircle size={13} class="animate-spin" />{:else}<Send size={13} />{/if}
            {sending ? m['api_client.sending']() : m['api_client.send']()}
          </Button>
        </div>
        <div class="flex shrink-0 items-center gap-2 border-b border-[var(--app-border)] px-2 py-1.5">
          <Input
            value={selectedRequest.name}
            name="request-name"
            autocomplete="off"
            aria-label={m['api_client.request_name']()}
            class="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1 text-[12px] font-semibold hover:border-[var(--app-border)]"
            oninput={(event: Event) => updateRequest({ name: inputValue(event) })}
            onblur={() => persist()}
          />
          <button class="grid size-7 place-items-center rounded text-[var(--app-text-muted)] hover:bg-[var(--app-danger-soft)] hover:text-[var(--app-danger)] focus-visible:ring-2 focus-visible:ring-[var(--app-danger)]" aria-label={m['api_client.delete_request']()} onclick={deleteRequest}>
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>

        <Tabs.Root bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
          <Tabs.List class="h-8 max-w-full shrink-0 justify-start overflow-x-auto rounded-none border-b border-[var(--app-border)] bg-transparent px-2">
            <Tabs.Trigger value="body" class="h-7 flex-none text-[10px]">{m['api_client.body']()}</Tabs.Trigger>
            <Tabs.Trigger value="headers" class="h-7 flex-none text-[10px]">{m['api_client.headers']()} <span class="tabular-nums">{selectedRequest.headers.filter((header) => header.enabled).length}</span></Tabs.Trigger>
            <Tabs.Trigger value="auth" class="h-7 flex-none text-[10px]">{m['api_client.auth']()}</Tabs.Trigger>
            <Tabs.Trigger value="variables" class="h-7 flex-none text-[10px]">{m['api_client.variables']()}</Tabs.Trigger>
            <Tabs.Trigger value="response" class="h-7 flex-none text-[10px]">{m['api_client.response']()}</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="body" class="m-0 min-h-0 flex-1 overflow-auto p-2">
            <div class="mb-2 flex items-center gap-1">
              {#each ['none', 'json', 'text', 'xml', 'form'] as mode}
                <button class={`rounded px-2 py-1 text-[10px] hover:bg-[var(--app-surface-raised)] ${selectedRequest.bodyMode === mode ? 'bg-[var(--app-surface-raised)] text-[var(--app-text)]' : 'text-[var(--app-text-muted)]'}`} onclick={() => updateRequest({ bodyMode: mode as ApiClientRequest['bodyMode'] }, true)}>{bodyModeLabel(mode)}</button>
              {/each}
            </div>
            {#if selectedRequest.bodyMode !== 'none'}
              <textarea
                class="h-[calc(100%-32px)] min-h-36 w-full resize-none rounded border border-[var(--app-border)] bg-[var(--app-canvas)] p-2 font-mono text-[11px] leading-5 text-[var(--app-text)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                aria-label={m['api_client.body']()}
                spellcheck="false"
                value={selectedRequest.body}
                oninput={(event) => updateRequest({ body: event.currentTarget.value })}
                onblur={() => persist()}
              ></textarea>
            {/if}
          </Tabs.Content>
          <Tabs.Content value="headers" class="m-0 min-h-0 flex-1 overflow-auto p-2">
            {#each selectedRequest.headers as header (header.id)}
              <div class="mb-1 grid grid-cols-[24px_minmax(90px,0.8fr)_minmax(120px,1.2fr)_28px] gap-1">
                <button class="grid size-7 place-items-center rounded border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-raised)]" aria-label={header.enabled ? m['api_client.disable_header']() : m['api_client.enable_header']()} onclick={() => updateHeader(header.id, { enabled: !header.enabled }, true)}>{#if header.enabled}<Check size={12} />{/if}</button>
                <Input value={header.name} name="header-name" autocomplete="off" spellcheck="false" aria-label={m['api_client.header_name']()} class="h-7 font-mono text-[10px]" oninput={(event: Event) => updateHeader(header.id, { name: inputValue(event) })} onblur={() => persist()} />
                <Input value={header.value} name="header-value" autocomplete="off" spellcheck="false" aria-label={m['api_client.header_value']()} class="h-7 font-mono text-[10px]" oninput={(event: Event) => updateHeader(header.id, { value: inputValue(event) })} onblur={() => persist()} />
                <button class="grid size-7 place-items-center rounded text-[var(--app-text-muted)] hover:bg-[var(--app-danger-soft)] hover:text-[var(--app-danger)]" aria-label={m['api_client.remove_header']()} onclick={() => removeHeader(header.id)}><Trash2 size={12} /></button>
              </div>
            {/each}
            <Button size="sm" variant="outline" class="mt-1 h-7 text-[10px]" onclick={addHeader}><Plus size={12} /> {m['api_client.add_header']()}</Button>
          </Tabs.Content>
          <Tabs.Content value="auth" class="m-0 min-h-0 flex-1 overflow-auto p-2">
            <NativeSelect.Root
              class="w-full"
              size="sm"
              aria-label={m['api_client.auth']()}
              value={selectedRequest.auth.type}
              onchange={(event: Event) => updateRequest({ auth: { ...selectedRequest.auth, type: (event.currentTarget as HTMLSelectElement).value as ApiClientRequest['auth']['type'] } }, true)}
            >
              <NativeSelect.Option value="none">{m['api_client.auth_none']()}</NativeSelect.Option>
              <NativeSelect.Option value="bearer">{m['api_client.auth_bearer']()}</NativeSelect.Option>
              <NativeSelect.Option value="basic">{m['api_client.auth_basic']()}</NativeSelect.Option>
            </NativeSelect.Root>
            {#if selectedRequest.auth.type === 'bearer'}
              <Input value={selectedRequest.auth.token} type="password" name="auth-token" autocomplete="off" spellcheck="false" aria-label={m['api_client.auth_token']()} placeholder={m['api_client.auth_token']()} class="mt-2 h-8 font-mono text-[11px]" oninput={(event: Event) => updateRequest({ auth: { ...selectedRequest.auth, token: inputValue(event) } })} onblur={() => persist()} />
            {:else if selectedRequest.auth.type === 'basic'}
              <div class="mt-2 grid grid-cols-2 gap-2">
                <Input value={selectedRequest.auth.username} name="auth-username" autocomplete="username" spellcheck="false" aria-label={m['api_client.auth_username']()} placeholder={m['api_client.auth_username']()} class="h-8 font-mono text-[11px]" oninput={(event: Event) => updateRequest({ auth: { ...selectedRequest.auth, username: inputValue(event) } })} onblur={() => persist()} />
                <Input value={selectedRequest.auth.password} type="password" name="auth-password" autocomplete="current-password" spellcheck="false" aria-label={m['api_client.auth_password']()} placeholder={m['api_client.auth_password']()} class="h-8 font-mono text-[11px]" oninput={(event: Event) => updateRequest({ auth: { ...selectedRequest.auth, password: inputValue(event) } })} onblur={() => persist()} />
              </div>
            {/if}
          </Tabs.Content>
          <Tabs.Content value="variables" class="m-0 min-h-0 flex-1 overflow-auto p-2">
            <p class="mb-2 text-[10px] text-[var(--app-text-muted)]">{m['api_client.variables_hint']()}</p>
            {#each Object.entries(variables) as [name, value] (name)}
              <div class="mb-1 grid grid-cols-[minmax(100px,0.8fr)_minmax(120px,1.2fr)_28px] gap-1">
                <Input value={name} name="variable-name" autocomplete="off" spellcheck="false" aria-label={m['api_client.variable_name']()} class="h-7 font-mono text-[10px]" onblur={(event: Event) => renameVariable(name, inputValue(event))} />
                <Input value={value} name="variable-value" autocomplete="off" spellcheck="false" aria-label={m['api_client.variable_value']()} class="h-7 font-mono text-[10px]" oninput={(event: Event) => (variables = { ...variables, [name]: inputValue(event) })} onblur={() => persist()} />
                <button class="grid size-7 place-items-center rounded text-[var(--app-text-muted)] hover:bg-[var(--app-danger-soft)] hover:text-[var(--app-danger)]" aria-label={m['api_client.remove_variable']()} onclick={() => { const next = { ...variables }; delete next[name]; variables = next; persist(); }}><Trash2 size={12} /></button>
              </div>
            {/each}
            <Button size="sm" variant="outline" class="mt-1 h-7 text-[10px]" onclick={addVariable}><Plus size={12} /> {m['api_client.add_variable']()}</Button>
          </Tabs.Content>
          <Tabs.Content value="response" class="m-0 min-h-0 flex-1 overflow-auto p-2">
            {#if response}
              <div class="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--app-text-muted)]">
                <strong class:text-emerald-500={response.ok} class:text-red-500={!response.ok}>{response.status} {response.statusText}</strong>
                <span class="tabular-nums">{response.durationMs} ms</span>
                <span class="tabular-nums">{new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(response.size / 1024)} KB</span>
                <span class="truncate">{response.contentType}</span>
              </div>
              {#if response.binary}<p class="text-[11px] text-[var(--app-text-muted)]">{m['api_client.binary_response']()}</p>{:else}<pre class="min-h-36 whitespace-pre-wrap break-words rounded border border-[var(--app-border)] bg-[var(--app-canvas)] p-2 font-mono text-[10px] leading-5 text-[var(--app-text)]">{displayBody(response.body)}</pre>{/if}
            {:else}
              <div class="grid h-full place-items-center text-[11px] text-[var(--app-text-muted)]">{m['api_client.no_response']()}</div>
            {/if}
          </Tabs.Content>
        </Tabs.Root>
        {#if error}<p class="shrink-0 border-t border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] text-red-500" aria-live="polite">{error}</p>{/if}
      </section>
    {:else}
      <section class="grid min-h-0 place-items-center p-6 text-center text-[11px] text-[var(--app-text-muted)]">
        <div><Braces size={28} class="mx-auto mb-3 opacity-40" /><p>{m['api_client.select_or_create']()}</p></div>
      </section>
    {/if}
  </div>
</NodeShell>
