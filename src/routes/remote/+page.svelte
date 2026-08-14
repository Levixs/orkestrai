<script lang="ts">
  import { onMount } from "svelte";
  import { getCsrfToken } from "@beeblock/svelar/http";
  import { toast } from "@beeblock/svelar/ui";
  import {
    Activity,
    ArrowRight,
    CheckCircle2,
    CircleDot,
    Clock3,
    KanbanSquare,
    LoaderCircle,
    LogOut,
    MessageSquareText,
    MonitorUp,
    Plus,
    RadioTower,
    RefreshCw,
    ShieldCheck,
    UsersRound,
    XCircle,
  } from "@lucide/svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import type {
    CollaborationCommand,
    CollaborationCommandResult,
    SharedWorkspaceDto,
  } from "$lib/modules/collaboration/domain/types.js";
  import * as m from "$lib/paraglide/messages.js";

  type RemoteState = {
    status:
      | "idle"
      | "connecting"
      | "waiting_approval"
      | "connected"
      | "reconnecting"
      | "rejected"
      | "expired"
      | "offline"
      | "incompatible"
      | "revoked"
      | "error";
    shareId: string | null;
    hostDeviceId: string | null;
    deviceId: string | null;
    displayName: string | null;
    role: string | null;
    scopes: string[];
    revision: number;
    snapshot: SharedWorkspaceDto | null;
    errorCode: string | null;
  };
  type DesktopBridge = {
    platform: "darwin" | "win32" | "linux";
    consumeCollaborationInvite?: () => Promise<string | null>;
    onCollaborationInvite?: (callback: () => void) => () => void;
  };

  let remoteState = $state<RemoteState>({
    status: "idle",
    shareId: null,
    hostDeviceId: null,
    deviceId: null,
    displayName: null,
    role: null,
    scopes: [],
    revision: 0,
    snapshot: null,
    errorCode: null,
  });
  let loading = $state(true);
  let busy = $state(false);
  let inviteUri = $state("");
  let relayUrl = $state("wss://relay.orkestrai.com/v1/connect");
  let displayName = $state("");
  let activeTab = $state("overview");
  let taskDialogOpen = $state(false);
  let taskTitle = $state("");
  let taskDescription = $state("");
  let taskStatus = $state("");
  let leaderMessage = $state("");
  const desktop = $derived(
    (window as typeof window & { orkestraiDesktop?: DesktopBridge })
      .orkestraiDesktop,
  );
  const desktopAvailable = $derived(Boolean(desktop) || import.meta.env.DEV);
  const snapshot = $derived(remoteState.snapshot);
  const canWriteTasks = $derived(remoteState.scopes.includes("tasks.write"));
  const canDecideReviews = $derived(
    remoteState.scopes.includes("approvals.decide"),
  );
  const canMessageLeader = $derived(
    remoteState.scopes.includes("leader.message"),
  );

  function headers(): Record<string, string> {
    const csrf = getCsrfToken();
    return {
      "content-type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    };
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { ...headers(), ...(init?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok || payload.error)
      throw new Error(
        payload.error || payload.data?.errorCode || m["remote.error"](),
      );
    return payload.data as T;
  }

  async function refresh(): Promise<void> {
    try {
      remoteState = await api<RemoteState>("/api/collaboration/remote");
    } catch {
      remoteState = {
        ...remoteState,
        status: "error",
        errorCode: "REMOTE_STATUS_FAILED",
      };
    } finally {
      loading = false;
    }
  }

  async function connect(invite = inviteUri): Promise<void> {
    if (!invite.trim() || !displayName.trim()) return;
    busy = true;
    try {
      remoteState = await api<RemoteState>("/api/collaboration/remote", {
        method: "POST",
        body: JSON.stringify({
          inviteUri: invite.trim(),
          relayUrl: relayUrl.trim(),
          displayName: displayName.trim(),
          platform: desktop?.platform ?? platformFromNavigator(),
        }),
      });
      inviteUri = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : m["remote.error"]());
    } finally {
      busy = false;
    }
  }

  async function consumeInvite(): Promise<void> {
    const invite = await desktop?.consumeCollaborationInvite?.();
    if (!invite) return;
    inviteUri = invite;
    if (displayName) await connect(invite);
  }

  async function leave(): Promise<void> {
    await api("/api/collaboration/remote", { method: "DELETE" });
    remoteState = {
      ...remoteState,
      status: "idle",
      snapshot: null,
      shareId: null,
      scopes: [],
      role: null,
      revision: 0,
    };
  }

  async function command(
    input: CollaborationCommand,
  ): Promise<CollaborationCommandResult | null> {
    busy = true;
    try {
      const result = await api<CollaborationCommandResult>(
        "/api/collaboration/remote/commands",
        { method: "POST", body: JSON.stringify(input) },
      );
      await refresh();
      return result;
    } catch (error) {
      await refresh();
      toast.error(
        error instanceof Error ? error.message : m["remote.command_error"](),
      );
      return null;
    } finally {
      busy = false;
    }
  }

  async function createTask(): Promise<void> {
    const result = await command({
      type: "task.create",
      title: taskTitle,
      description: taskDescription || null,
      status: taskStatus || undefined,
    });
    if (!result?.accepted) return;
    taskTitle = "";
    taskDescription = "";
    taskStatus = "";
    taskDialogOpen = false;
  }

  async function updateTask(taskId: string, status: string): Promise<void> {
    await command({ type: "task.update", taskId, status });
  }

  async function decideReview(
    reviewId: string,
    status: "approved" | "changes_requested" | "rejected",
  ): Promise<void> {
    await command({ type: "review.decide", reviewId, status });
  }

  async function sendLeaderMessage(): Promise<void> {
    if (!leaderMessage.trim()) return;
    const result = await command({
      type: "leader.message",
      message: leaderMessage.trim(),
    });
    if (result?.accepted) leaderMessage = "";
  }

  function platformFromNavigator(): "darwin" | "win32" | "linux" {
    const platform = navigator.platform.toLowerCase();
    return platform.includes("mac")
      ? "darwin"
      : platform.includes("win")
        ? "win32"
        : "linux";
  }

  function statusLabel(status: RemoteState["status"]): string {
    const labels: Record<RemoteState["status"], () => string> = {
      idle: m["remote.status_idle"],
      connecting: m["remote.status_connecting"],
      waiting_approval: m["remote.status_waiting_approval"],
      connected: m["remote.status_connected"],
      reconnecting: m["remote.status_reconnecting"],
      rejected: m["remote.status_rejected"],
      expired: m["remote.status_expired"],
      offline: m["remote.status_offline"],
      incompatible: m["remote.status_incompatible"],
      revoked: m["remote.status_revoked"],
      error: m["remote.status_error"],
    };
    return labels[status]();
  }

  function roleLabel(role: string | null): string {
    const labels: Record<string, () => string> = {
      viewer: m["collaboration.role_viewer"],
      collaborator: m["collaboration.role_collaborator"],
      operator: m["collaboration.role_operator"],
      administrator: m["collaboration.role_administrator"],
    };
    return role ? (labels[role]?.() ?? role) : "";
  }

  function nodeStyle(node: SharedWorkspaceDto["nodes"][number]): string {
    if (!snapshot?.nodes.length) return "";
    const minX = Math.min(...snapshot.nodes.map((item) => item.x));
    const minY = Math.min(...snapshot.nodes.map((item) => item.y));
    const maxX = Math.max(...snapshot.nodes.map((item) => item.x + item.width));
    const maxY = Math.max(
      ...snapshot.nodes.map((item) => item.y + item.height),
    );
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return `left:${((node.x - minX) / width) * 100}%;top:${((node.y - minY) / height) * 100}%;width:${Math.max(5, (node.width / width) * 100)}%;height:${Math.max(7, (node.height / height) * 100)}%`;
  }

  onMount(() => {
    displayName = `${m["remote.device_default"]()} (${desktop?.platform ?? platformFromNavigator()})`;
    void refresh().then(consumeInvite);
    const unsubscribe = desktop?.onCollaborationInvite?.(
      () => void consumeInvite(),
    );
    const timer = setInterval(() => void refresh(), 1_000);
    return () => {
      clearInterval(timer);
      unsubscribe?.();
      inviteUri = "";
    };
  });
</script>

<svelte:head><title>{m["remote.title"]()} - Orkestrai</title></svelte:head>

{#if !desktopAvailable}
  <main
    class="grid h-full place-items-center bg-[var(--app-canvas)] p-6 text-[var(--app-text)]"
  >
    <div class="max-w-md text-center">
      <MonitorUp size={34} class="mx-auto text-[var(--app-accent)]" />
      <h1 class="mt-4 text-xl font-semibold">
        {m["remote.desktop_required_title"]()}
      </h1>
      <p
        class="mt-2 text-sm leading-6 text-pretty text-[var(--app-text-muted)]"
      >
        {m["remote.desktop_required_body"]()}
      </p>
    </div>
  </main>
{:else if loading}
  <main class="grid h-full place-items-center bg-[var(--app-canvas)]">
    <LoaderCircle size={24} class="animate-spin text-[var(--app-accent)]" />
  </main>
{:else if remoteState.status === "idle" || ["rejected", "expired", "incompatible", "revoked", "error"].includes(remoteState.status)}
  <main
    class="grid h-full overflow-y-auto bg-[var(--app-canvas)] p-5 text-[var(--app-text)] lg:grid-cols-[minmax(320px,560px)_minmax(280px,1fr)] lg:items-center lg:gap-12 lg:p-12"
  >
    <section class="mx-auto w-full max-w-xl">
      <div
        class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--app-accent)]"
      >
        <RadioTower size={14} />{m["remote.eyebrow"]()}
      </div>
      <h1 class="mt-3 text-2xl font-semibold leading-tight text-balance">
        {m["remote.join_title"]()}
      </h1>
      <p
        class="mt-3 max-w-lg text-sm leading-6 text-pretty text-[var(--app-text-muted)]"
      >
        {m["remote.join_body"]()}
      </p>
      {#if remoteState.status !== "idle"}<div
          class="mt-4 flex items-center gap-2 rounded-lg border border-[var(--app-danger)]/30 bg-[var(--app-danger)]/5 p-3 text-xs text-[var(--app-danger)]"
        >
          <XCircle size={15} />{statusLabel(remoteState.status)}
        </div>{/if}
      <form
        class="mt-6 space-y-4"
        onsubmit={(event) => {
          event.preventDefault();
          void connect();
        }}
      >
        <label class="grid gap-1.5 text-xs font-medium"
          >{m["remote.invite_link"]()}<Input
            type="password"
            bind:value={inviteUri}
            autocomplete="off"
            spellcheck="false"
            placeholder="orkestrai://join/..."
          /></label
        >
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="grid gap-1.5 text-xs font-medium"
            >{m["remote.device_name"]()}<Input
              bind:value={displayName}
              maxlength="80"
            /></label
          ><label class="grid gap-1.5 text-xs font-medium"
            >{m["collaboration.relay"]()}<Input
              bind:value={relayUrl}
              autocomplete="off"
              spellcheck="false"
            /></label
          >
        </div>
        <Button
          type="submit"
          disabled={busy || !inviteUri.trim() || !displayName.trim()}
          >{#if busy}<LoaderCircle class="animate-spin" />{:else}<ShieldCheck
            />{/if}{m["remote.connect"]()}<ArrowRight /></Button
        >
      </form>
    </section>
    <section class="mx-auto mt-10 w-full max-w-lg lg:mt-0">
      <div
        class="relative aspect-[4/3] overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] shadow-xl"
      >
        <div
          class="flex h-10 items-center gap-2 border-b border-[var(--app-border)] px-3"
        >
          <span class="size-2 rounded-full bg-[var(--app-danger)]"></span><span
            class="size-2 rounded-full bg-[var(--app-warning)]"
          ></span><span class="size-2 rounded-full bg-[var(--app-success)]"
          ></span><span class="ml-2 text-[10px] text-[var(--app-text-muted)]"
            >{m["remote.preview_title"]()}</span
          >
        </div>
        <div class="grid h-[calc(100%-40px)] grid-cols-[34%_1fr]">
          <div class="border-r border-[var(--app-border)] p-3">
            <div class="mb-4 h-2 w-2/3 rounded bg-[var(--app-accent)]/30"></div>
            {#each [1, 2, 3, 4] as item}<div
                class="mb-2 h-7 rounded bg-[var(--app-surface-raised)]"
                style:opacity={1 - item * 0.12}
              ></div>{/each}
          </div>
          <div class="grid grid-cols-2 gap-3 p-4">
            {#each [1, 2, 3, 4] as item}<div
                class="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-3"
              >
                <div class="h-2 w-1/2 rounded bg-[var(--app-accent)]/35"></div>
                <div
                  class="mt-3 h-1.5 w-full rounded bg-[var(--app-border)]"
                ></div>
                <div
                  class="mt-2 h-1.5 w-3/4 rounded bg-[var(--app-border)]"
                ></div>
              </div>{/each}
          </div>
        </div>
      </div>
    </section>
  </main>
{:else if remoteState.status !== "connected" || !snapshot}
  <main
    class="grid h-full place-items-center bg-[var(--app-canvas)] p-6 text-[var(--app-text)]"
  >
    <div class="max-w-md text-center">
      <span
        class="mx-auto grid size-14 place-items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)]"
        ><LoaderCircle
          size={25}
          class={remoteState.status === "waiting_approval" ||
          remoteState.status === "connecting" ||
          remoteState.status === "reconnecting"
            ? "animate-spin text-[var(--app-accent)]"
            : "text-[var(--app-text-muted)]"}
        /></span
      >
      <h1 class="mt-4 text-lg font-semibold">
        {statusLabel(remoteState.status)}
      </h1>
      <p class="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">
        {m["remote.waiting_body"]()}
      </p>
      <Button variant="ghost" class="mt-5" onclick={leave}
        ><LogOut />{m["remote.leave"]()}</Button
      >
    </div>
  </main>
{:else}
  <main
    class="grid h-full min-h-0 grid-rows-[56px_minmax(0,1fr)] bg-[var(--app-canvas)] text-[var(--app-text)]"
  >
    <header
      class="flex items-center gap-3 border-b border-[var(--app-border)] bg-[var(--app-sidebar)] px-4"
    >
      <span
        class="grid size-8 place-items-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
        ><RadioTower size={16} /></span
      >
      <div class="min-w-0">
        <h1 class="truncate text-sm font-semibold">
          {snapshot.workspace.name}
        </h1>
        <p class="text-[10px] text-[var(--app-text-muted)]">
          {roleLabel(remoteState.role)} · {m["remote.revision"]({
            revision: remoteState.revision,
          })}
        </p>
      </div>
      <div
        class="ml-auto size-14 shrink-0"
        data-dictation-dock
        aria-hidden="true"
      ></div>
      <Badge variant="outline" class="gap-1 border-[var(--app-border)]"
        ><span class="size-1.5 rounded-full bg-[var(--app-success)]"></span>{m[
          "remote.live"
        ]()}</Badge
      >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={m["remote.refresh"]()}
        onclick={refresh}><RefreshCw /></Button
      >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={m["remote.leave"]()}
        onclick={leave}><LogOut /></Button
      >
    </header>
    <Tabs.Root
      bind:value={activeTab}
      orientation="vertical"
      class="grid min-h-0 grid-cols-[180px_minmax(0,1fr)] gap-0 max-[720px]:grid-cols-[64px_minmax(0,1fr)]"
    >
      <Tabs.List
        class="h-full min-h-0 flex-col items-stretch justify-start rounded-none border-r border-[var(--app-border)] bg-[var(--app-sidebar)] p-2"
      >
        <Tabs.Trigger
          value="overview"
          class="justify-start gap-2 max-[720px]:justify-center"
          ><Activity /><span class="max-[720px]:hidden"
            >{m["remote.overview"]()}</span
          ></Tabs.Trigger
        >
        <Tabs.Trigger
          value="tasks"
          class="justify-start gap-2 max-[720px]:justify-center"
          ><KanbanSquare /><span class="max-[720px]:hidden"
            >{m["remote.tasks"]()}</span
          ></Tabs.Trigger
        >
        <Tabs.Trigger
          value="reviews"
          class="justify-start gap-2 max-[720px]:justify-center"
          ><CheckCircle2 /><span class="max-[720px]:hidden"
            >{m["remote.approvals"]()}</span
          ></Tabs.Trigger
        >
        <Tabs.Trigger
          value="team"
          class="justify-start gap-2 max-[720px]:justify-center"
          ><UsersRound /><span class="max-[720px]:hidden"
            >{m["remote.team"]()}</span
          ></Tabs.Trigger
        >
      </Tabs.List>

      <Tabs.Content value="overview" class="m-0 min-h-0 overflow-y-auto p-5">
        <div class="mx-auto max-w-6xl">
          <div class="grid gap-4 sm:grid-cols-3">
            <div class="rounded-lg border border-[var(--app-border)] p-4">
              <p class="text-[10px] uppercase text-[var(--app-text-muted)]">
                {m["remote.agents_working"]()}
              </p>
              <strong class="mt-2 block text-2xl tabular-nums"
                >{snapshot.agents.filter((agent) => agent.state === "working")
                  .length}</strong
              >
            </div>
            <div class="rounded-lg border border-[var(--app-border)] p-4">
              <p class="text-[10px] uppercase text-[var(--app-text-muted)]">
                {m["remote.open_tasks"]()}
              </p>
              <strong class="mt-2 block text-2xl tabular-nums"
                >{snapshot.tasks.filter((task) => task.status !== "done")
                  .length}</strong
              >
            </div>
            <div class="rounded-lg border border-[var(--app-border)] p-4">
              <p class="text-[10px] uppercase text-[var(--app-text-muted)]">
                {m["remote.pending_reviews"]()}
              </p>
              <strong class="mt-2 block text-2xl tabular-nums"
                >{snapshot.reviews.filter(
                  (review) => review.status === "pending",
                ).length}</strong
              >
            </div>
          </div>
          <section class="mt-5">
            <h2
              class="mb-2 text-xs font-semibold uppercase text-[var(--app-text-muted)]"
            >
              {m["remote.canvas_map"]()}
            </h2>
            <div
              class="relative aspect-[16/7] min-h-64 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] [background-image:radial-gradient(var(--app-border)_1px,transparent_1px)] [background-size:18px_18px]"
            >
              {#each snapshot.nodes as node (node.id)}<div
                  class={`absolute flex min-h-8 items-center overflow-hidden rounded-md border px-2 text-[9px] shadow-sm ${node.type === "agent" ? "border-[var(--app-accent)]/50 bg-[var(--app-accent-soft)] text-[var(--app-text)]" : "border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--app-text-soft)]"}`}
                  style={nodeStyle(node)}
                  title={node.title ?? node.type}
                >
                  <span class="truncate">{node.title ?? node.type}</span>
                </div>{/each}
            </div>
          </section>
          {#if canMessageLeader}<section class="mt-5">
              <h2
                class="mb-2 text-xs font-semibold uppercase text-[var(--app-text-muted)]"
              >
                {m["remote.message_leader"]()}
              </h2>
              <div class="flex gap-2">
                <Textarea
                  bind:value={leaderMessage}
                  class="min-h-20 resize-y"
                  placeholder={m["remote.message_placeholder"]()}
                /><Button
                  class="self-end"
                  disabled={busy || !leaderMessage.trim()}
                  onclick={sendLeaderMessage}
                  ><MessageSquareText />{m["remote.send"]()}</Button
                >
              </div>
            </section>{/if}
        </div>
      </Tabs.Content>

      <Tabs.Content value="tasks" class="m-0 min-h-0 overflow-y-auto p-5">
        <div class="mx-auto max-w-6xl">
          <div class="mb-4 flex items-center">
            <div>
              <h2 class="text-base font-semibold">{m["remote.tasks"]()}</h2>
              <p class="text-xs text-[var(--app-text-muted)]">
                {m["remote.tasks_body"]()}
              </p>
            </div>
            {#if canWriteTasks}<Button
                class="ml-auto"
                size="sm"
                onclick={() => (taskDialogOpen = true)}
                ><Plus />{m["remote.create_task"]()}</Button
              >{/if}
          </div>
          <div class="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            {#each snapshot.columns as column (column.id)}<section
                class="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]"
              >
                <header
                  class="flex h-10 items-center gap-2 border-b border-[var(--app-border)] px-3"
                >
                  <span
                    class="size-2 rounded-full"
                    style:background={column.color}
                  ></span>
                  <h3 class="truncate text-xs font-semibold">
                    {column.name ?? column.key}
                  </h3>
                  <span
                    class="ml-auto text-[10px] tabular-nums text-[var(--app-text-muted)]"
                    >{snapshot.tasks.filter(
                      (task) =>
                        task.status === column.key ||
                        task.status === column.name,
                    ).length}</span
                  >
                </header>
                <div class="space-y-2 p-2">
                  {#each snapshot.tasks.filter((task) => task.status === column.key || task.status === column.name) as task (task.id)}<article
                      class="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-3"
                    >
                      <h4 class="text-xs font-medium leading-5">
                        {task.title}
                      </h4>
                      {#if task.description}<p
                          class="mt-1 line-clamp-3 text-[10px] leading-4 text-[var(--app-text-muted)]"
                        >
                          {task.description}
                        </p>{/if}
                      <div class="mt-2 flex items-center gap-2">
                        <span
                          class="min-w-0 flex-1 truncate text-[9px] text-[var(--app-text-soft)]"
                          >{task.assigneeTitle ??
                            m["remote.unassigned"]()}</span
                        >{#if canWriteTasks}<Select.Root
                            type="single"
                            value={task.status}
                            onValueChange={(value: string) =>
                              void updateTask(task.id, value)}
                            disabled={busy}
                            ><Select.Trigger
                              size="sm"
                              class="h-6 max-w-28 text-[9px]"
                              ><span class="truncate"
                                >{column.name ?? column.key}</span
                              ></Select.Trigger
                            ><Select.Content
                              >{#each snapshot.columns as target}<Select.Item
                                  value={target.key}
                                  >{target.name ?? target.key}</Select.Item
                                >{/each}</Select.Content
                            ></Select.Root
                          >{/if}
                      </div>
                    </article>{:else}<p
                      class="py-5 text-center text-[10px] text-[var(--app-text-muted)]"
                    >
                      {m["remote.column_empty"]()}
                    </p>{/each}
                </div>
              </section>{/each}
          </div>
        </div>
      </Tabs.Content>

      <Tabs.Content value="reviews" class="m-0 min-h-0 overflow-y-auto p-5"
        ><div class="mx-auto max-w-4xl">
          <h2 class="text-base font-semibold">{m["remote.approvals"]()}</h2>
          <div class="mt-4 space-y-3">
            {#each snapshot.reviews as review (review.id)}<article
                class="rounded-lg border border-[var(--app-border)] p-4"
              >
                <div class="flex items-start gap-3">
                  <div class="min-w-0 flex-1">
                    <h3 class="text-sm font-semibold">{review.title}</h3>
                    {#if review.summary}<p
                        class="mt-1 text-xs leading-5 text-[var(--app-text-muted)]"
                      >
                        {review.summary}
                      </p>{/if}
                    <p class="mt-2 text-[10px] text-[var(--app-text-soft)]">
                      {review.evidenceCount}
                      {m["remote.evidence"]()} · {review.testCount}
                      {m["remote.tests"]()} · {review.riskCount}
                      {m["remote.risks"]()}
                    </p>
                  </div>
                  <Badge variant="outline">{review.status}</Badge>
                </div>
                {#if canDecideReviews && review.status === "pending"}<div
                    class="mt-3 flex flex-wrap gap-2"
                  >
                    <Button
                      size="sm"
                      onclick={() => decideReview(review.id, "approved")}
                      ><CheckCircle2 />{m["remote.approve"]()}</Button
                    ><Button
                      size="sm"
                      variant="outline"
                      onclick={() =>
                        decideReview(review.id, "changes_requested")}
                      ><RefreshCw />{m["remote.request_changes"]()}</Button
                    ><Button
                      size="sm"
                      variant="destructive"
                      onclick={() => decideReview(review.id, "rejected")}
                      ><XCircle />{m["remote.reject"]()}</Button
                    >
                  </div>{/if}
              </article>{:else}<p
                class="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center text-xs text-[var(--app-text-muted)]"
              >
                {m["remote.no_reviews"]()}
              </p>{/each}
          </div>
        </div></Tabs.Content
      >

      <Tabs.Content value="team" class="m-0 min-h-0 overflow-y-auto p-5"
        ><div class="mx-auto max-w-4xl">
          <h2 class="text-base font-semibold">{m["remote.team"]()}</h2>
          <div
            class="mt-4 divide-y divide-[var(--app-border)] rounded-lg border border-[var(--app-border)]"
          >
            {#each snapshot.agents as agent (agent.id)}<div
                class="flex items-center gap-3 p-3"
              >
                <span
                  class={`size-2 rounded-full ${agent.state === "working" ? "bg-[var(--app-success)]" : agent.state.includes("waiting") ? "bg-[var(--app-warning)]" : "bg-[var(--app-text-muted)]"}`}
                ></span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{agent.title}</p>
                  <p
                    class="mt-0.5 truncate text-[10px] text-[var(--app-text-muted)]"
                  >
                    {agent.role ?? agent.provider ?? ""}
                  </p>
                </div>
                <div class="max-w-52 text-right">
                  <p class="text-[10px] text-[var(--app-text-soft)]">
                    {agent.state}
                  </p>
                  {#if agent.currentTask}<p
                      class="mt-0.5 truncate text-[9px] text-[var(--app-text-muted)]"
                    >
                      {agent.currentTask.title}
                    </p>{/if}
                </div>
              </div>{:else}<p
                class="p-8 text-center text-xs text-[var(--app-text-muted)]"
              >
                {m["remote.no_agents"]()}
              </p>{/each}
          </div>
        </div></Tabs.Content
      >
    </Tabs.Root>
  </main>
{/if}

<Dialog.Root bind:open={taskDialogOpen}>
  <Dialog.Content class="sm:max-w-lg"
    ><Dialog.Header
      ><Dialog.Title>{m["remote.create_task"]()}</Dialog.Title
      ><Dialog.Description>{m["remote.create_task_body"]()}</Dialog.Description
      ></Dialog.Header
    >
    <div class="space-y-4">
      <label class="grid gap-1.5 text-xs font-medium"
        >{m["remote.task_title"]()}<Input
          bind:value={taskTitle}
          maxlength="180"
        /></label
      ><label class="grid gap-1.5 text-xs font-medium"
        >{m["remote.task_description"]()}<Textarea
          bind:value={taskDescription}
          class="min-h-28 resize-y"
        /></label
      ><label class="grid gap-1.5 text-xs font-medium"
        >{m["remote.task_column"]()}<Select.Root type="single" bind:value={taskStatus}
          ><Select.Trigger class="w-full"
            ><span
              >{snapshot?.columns.find((column) => column.key === taskStatus)
                ?.name ?? m["remote.default_column"]()}</span
            ></Select.Trigger
          ><Select.Content
            >{#each snapshot?.columns ?? [] as column}<Select.Item
                value={column.key}>{column.name ?? column.key}</Select.Item
              >{/each}</Select.Content
          ></Select.Root
        ></label
      >
    </div>
    <Dialog.Footer
      ><Button variant="ghost" onclick={() => (taskDialogOpen = false)}
        >{m["settings.cancel"]()}</Button
      ><Button disabled={busy || !taskTitle.trim()} onclick={createTask}
        >{#if busy}<LoaderCircle class="animate-spin" />{/if}{m[
          "remote.create_task"
        ]()}</Button
      ></Dialog.Footer
    ></Dialog.Content
  >
</Dialog.Root>
