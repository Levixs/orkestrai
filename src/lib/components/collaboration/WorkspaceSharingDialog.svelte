<script lang="ts">
  import { onMount } from "svelte";
  import { getCsrfToken } from "@beeblock/svelar/http";
  import { toast } from "@beeblock/svelar/ui";
  import { defaults, superForm } from "sveltekit-superforms";
  import { zod } from "sveltekit-superforms/adapters";
  import QRCode from "qrcode";
  import {
    Check,
    Clipboard,
    Clock3,
    KeyRound,
    Laptop,
    LoaderCircle,
    RadioTower,
    RefreshCw,
    ShieldCheck,
    ShieldOff,
    Signal,
    UserCheck,
    UserX,
  } from "@lucide/svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Switch } from "$lib/components/ui/switch";
  import { createCollaborationShareSchema } from "$lib/modules/collaboration/contracts/schemas/collaboration.schema.js";
  import { localeState } from "$lib/i18n/locale.svelte.js";
  import type {
    CollaborationAuditData,
    CollaborationDeviceData,
    CollaborationRole,
    CollaborationShareData,
  } from "$lib/modules/collaboration/domain/types.js";
  import * as m from "$lib/paraglide/messages.js";

  type SharingStatus = {
    enabled: boolean;
    share: CollaborationShareData | null;
    transport?: {
      state: "connecting" | "connected" | "reconnecting" | "offline";
      connectedPeers: number;
    };
    inviteAvailable: boolean;
    devices: CollaborationDeviceData[];
    audit: CollaborationAuditData[];
  };

  let { workspaceId, onClose }: { workspaceId: string; onClose: () => void } =
    $props();
  let status = $state<SharingStatus | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  let activeTab = $state("invite");
  let inviteUri = $state("");
  let qrDataUrl = $state("");
  let copied = $state(false);
  let confirmStop = $state(false);
  let pendingRevoke = $state<CollaborationDeviceData | null>(null);
  let roleDrafts = $state<Record<string, CollaborationRole>>({});

  const schema = createCollaborationShareSchema as unknown as Parameters<
    typeof zod
  >[0];
  const form = superForm(
    defaults(
      {
        defaultRole: "viewer" as CollaborationRole,
        expiresInMinutes: 15,
        maxPeers: 5,
        relayUrl: "wss://relay.orkestrai.app/v1/connect",
      },
      zod(schema),
    ),
    {
      SPA: true,
      validators: zod(schema),
      async onUpdate({ form: result }) {
        if (result.valid)
          await startSharing(result.data as Parameters<typeof startSharing>[0]);
      },
    },
  );
  const { form: formData, enhance } = form;

  const pendingDevices = $derived(
    status?.devices.filter(
      (device) => !device.approvedAt && !device.revokedAt,
    ) ?? [],
  );
  const approvedDevices = $derived(
    status?.devices.filter(
      (device) => device.approvedAt && !device.revokedAt,
    ) ?? [],
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
      throw new Error(payload.error || m["collaboration.error"]());
    return payload.data as T;
  }

  async function refresh(silent = false): Promise<void> {
    if (!silent) loading = true;
    try {
      const previousPendingIds = new Set(
        (status?.devices ?? [])
          .filter((device) => !device.approvedAt && !device.revokedAt)
          .map((device) => device.id),
      );
      const nextStatus = await api<SharingStatus>(
        `/api/agent-room/workspaces/${workspaceId}/collaboration`,
      );
      const hasNewPendingDevice = nextStatus.devices.some(
        (device) =>
          !device.approvedAt &&
          !device.revokedAt &&
          !previousPendingIds.has(device.id),
      );
      status = nextStatus;
      if (silent && hasNewPendingDevice) {
        activeTab = "access";
        toast.info(m["collaboration.event_device_requested"]());
      }
      roleDrafts = Object.fromEntries(
        (status.devices ?? []).map((device) => [
          device.id,
          roleDrafts[device.id] ?? device.role,
        ]),
      );
    } catch (error) {
      if (!silent)
        toast.error(
          error instanceof Error ? error.message : m["collaboration.error"](),
        );
    } finally {
      loading = false;
    }
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    busy = true;
    try {
      await api(
        `/api/agent-room/workspaces/${workspaceId}/collaboration/experimental`,
        {
          method: "PATCH",
          body: JSON.stringify({ enabled }),
        },
      );
      await refresh(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : m["collaboration.error"](),
      );
    } finally {
      busy = false;
    }
  }

  async function renderQr(): Promise<void> {
    qrDataUrl = inviteUri
      ? await QRCode.toDataURL(inviteUri, {
          width: 224,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#111318", light: "#ffffff" },
        })
      : "";
  }

  async function startSharing(input: {
    defaultRole: CollaborationRole;
    expiresInMinutes: number;
    maxPeers: number;
    relayUrl: string;
  }): Promise<void> {
    busy = true;
    try {
      const created = await api<{
        share: CollaborationShareData;
        inviteUri: string;
      }>(`/api/agent-room/workspaces/${workspaceId}/collaboration`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      inviteUri = created.inviteUri;
      await renderQr();
      toast.success(m["collaboration.started"]());
      await refresh(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : m["collaboration.error"](),
      );
    } finally {
      busy = false;
    }
  }

  async function refreshInvite(): Promise<void> {
    if (!status?.share) return;
    busy = true;
    try {
      const data = await api<{ inviteUri: string }>(
        `/api/agent-room/workspaces/${workspaceId}/collaboration/${status.share.id}/invite`,
      );
      inviteUri = data.inviteUri;
      copied = false;
      await renderQr();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : m["collaboration.error"](),
      );
    } finally {
      busy = false;
    }
  }

  async function copyInvite(): Promise<void> {
    if (!inviteUri) return;
    await navigator.clipboard.writeText(inviteUri);
    copied = true;
    setTimeout(() => (copied = false), 2_000);
  }

  async function decide(
    device: CollaborationDeviceData,
    approved: boolean,
  ): Promise<void> {
    if (!status?.share) return;
    busy = true;
    try {
      await api(
        `/api/agent-room/workspaces/${workspaceId}/collaboration/${status.share.id}/devices/${device.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            approved,
            role: roleDrafts[device.id] ?? device.role,
          }),
        },
      );
      if (approved) {
        inviteUri = "";
        qrDataUrl = "";
        toast.success(
          m["collaboration.device_approved"]({ name: device.displayName }),
        );
      }
      await refresh(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : m["collaboration.error"](),
      );
    } finally {
      busy = false;
    }
  }

  async function revoke(): Promise<void> {
    if (!status?.share || !pendingRevoke) return;
    busy = true;
    try {
      await api(
        `/api/agent-room/workspaces/${workspaceId}/collaboration/${status.share.id}/devices/${pendingRevoke.id}`,
        { method: "DELETE" },
      );
      pendingRevoke = null;
      await refresh(true);
    } finally {
      busy = false;
    }
  }

  async function stopSharing(): Promise<void> {
    if (!status?.share) return;
    busy = true;
    try {
      await api(
        `/api/agent-room/workspaces/${workspaceId}/collaboration/${status.share.id}`,
        { method: "DELETE" },
      );
      inviteUri = "";
      qrDataUrl = "";
      confirmStop = false;
      await refresh(true);
    } finally {
      busy = false;
    }
  }

  function roleLabel(role: CollaborationRole): string {
    return m[`collaboration.role_${role}`]();
  }

  function roleDescription(role: CollaborationRole): string {
    return (
      {
        viewer: m["collaboration.role_viewer_desc"],
        collaborator: m["collaboration.role_collaborator_desc"],
        operator: m["collaboration.role_operator_desc"],
        administrator: m["collaboration.role_administrator_desc"],
      } as const
    )[role]();
  }

  function transportLabel(
    state: "connecting" | "connected" | "reconnecting" | "offline",
  ): string {
    return (
      (
        {
          connecting: m["collaboration.status_connecting"],
          connected: m["collaboration.status_connected"],
          reconnecting: m["collaboration.status_reconnecting"],
          offline: m["collaboration.status_offline"],
        } as const
      )[state]?.() ?? m["collaboration.status_offline"]()
    );
  }

  function expiryLabel(minutes: number): string {
    return (
      (
        {
          15: m["collaboration.expires_15"],
          30: m["collaboration.expires_30"],
          60: m["collaboration.expires_60"],
          240: m["collaboration.expires_240"],
          1440: m["collaboration.expires_1440"],
        } as Record<number, () => string>
      )[minutes]?.() ?? String(minutes)
    );
  }

  function eventLabel(event: string): string {
    const key = `collaboration.event_${event.replaceAll(".", "_")}`;
    const labels: Record<string, () => string> = {
      "collaboration.event_share_started":
        m["collaboration.event_share_started"],
      "collaboration.event_share_stopped":
        m["collaboration.event_share_stopped"],
      "collaboration.event_share_expired":
        m["collaboration.event_share_expired"],
      "collaboration.event_device_requested":
        m["collaboration.event_device_requested"],
      "collaboration.event_device_approved":
        m["collaboration.event_device_approved"],
      "collaboration.event_device_rejected":
        m["collaboration.event_device_rejected"],
      "collaboration.event_device_revoked":
        m["collaboration.event_device_revoked"],
      "collaboration.event_device_reconnected":
        m["collaboration.event_device_reconnected"],
      "collaboration.event_command_accepted":
        m["collaboration.event_command_accepted"],
      "collaboration.event_command_rejected":
        m["collaboration.event_command_rejected"],
    };
    return labels[key]?.() ?? event;
  }

  onMount(() => {
    void refresh();
    const timer = setInterval(() => void refresh(true), 2_000);
    return () => {
      clearInterval(timer);
      inviteUri = "";
      qrDataUrl = "";
    };
  });
</script>

<Dialog.Root open onOpenChange={(open) => !open && onClose()}>
  <Dialog.Content
    class="grid max-h-[min(90dvh,820px)] max-w-[calc(100%-1.5rem)]! grid-rows-[auto_minmax(0,1fr)] gap-0! overflow-hidden rounded-lg p-0! sm:max-w-3xl!"
  >
    <Dialog.Header class="border-b border-border/60 px-5 py-4 pr-12">
      <div class="flex items-start gap-3">
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
          ><RadioTower size={18} /></span
        >
        <div class="min-w-0">
          <Dialog.Title>{m["collaboration.title"]()}</Dialog.Title>
          <Dialog.Description class="text-pretty"
            >{m["collaboration.subtitle"]()}</Dialog.Description
          >
        </div>
        {#if status?.share}
          <Badge
            variant="outline"
            class="ml-auto mr-5 gap-1 border-[var(--app-border)] text-[var(--app-text-soft)]"
          >
            <span
              class={`size-1.5 rounded-full ${status.transport?.state === "connected" ? "bg-[var(--app-success)]" : "bg-[var(--app-warning)]"}`}
            ></span>
            {transportLabel(status.transport?.state ?? "offline")}
          </Badge>
        {/if}
      </div>
    </Dialog.Header>

    <div class="min-h-0 overflow-y-auto overscroll-contain">
      {#if loading}
        <div class="grid min-h-80 place-items-center">
          <LoaderCircle
            class="animate-spin text-[var(--app-accent)]"
            size={22}
          />
        </div>
      {:else if !status?.enabled}
        <div
          class="mx-auto flex min-h-[430px] max-w-xl flex-col justify-center px-6 py-10 text-center"
        >
          <span
            class="mx-auto grid size-12 place-items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--app-accent)]"
            ><ShieldCheck size={23} /></span
          >
          <h2 class="mt-4 text-base font-semibold">
            {m["collaboration.experimental_title"]()}
          </h2>
          <p
            class="mt-2 text-sm leading-6 text-pretty text-[var(--app-text-muted)]"
          >
            {m["collaboration.experimental_body"]()}
          </p>
          <div class="mt-5 flex items-center justify-center gap-3">
            <Switch
              checked={false}
              disabled={busy}
              onCheckedChange={(checked: boolean) => void setEnabled(checked)}
              aria-label={m["collaboration.enable"]()}
            />
            <span class="text-sm font-medium"
              >{m["collaboration.enable"]()}</span
            >
          </div>
        </div>
      {:else if !status.share}
        <form
          method="POST"
          use:enhance
          class="mx-auto max-w-2xl space-y-5 px-6 py-6"
        >
          <div
            class="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-4"
          >
            <div class="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={16} class="text-[var(--app-success)]" />{m[
                "collaboration.private_title"
              ]()}
            </div>
            <p class="mt-1.5 text-xs leading-5 text-[var(--app-text-muted)]">
              {m["collaboration.private_body"]()}
            </p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1.5 text-xs font-medium"
              >{m["collaboration.default_role"]()}
              <Select.Root
                type="single"
                value={$formData.defaultRole as string}
                onValueChange={(value: string) =>
                  ($formData.defaultRole = value as CollaborationRole)}
              >
                <Select.Trigger class="w-full"
                  ><span
                    >{$formData.defaultRole
                      ? roleLabel($formData.defaultRole as CollaborationRole)
                      : ""}</span
                  ></Select.Trigger
                >
                <Select.Content
                  >{#each ["viewer", "collaborator", "operator", "administrator"] as role}<Select.Item
                      value={role}
                      >{roleLabel(role as CollaborationRole)}</Select.Item
                    >{/each}</Select.Content
                >
              </Select.Root>
              <span class="font-normal leading-4 text-[var(--app-text-muted)]"
                >{roleDescription(
                  $formData.defaultRole as CollaborationRole,
                )}</span
              >
            </label>
            <label class="grid gap-1.5 text-xs font-medium"
              >{m["collaboration.expires"]()}
              <Select.Root
                type="single"
                value={String($formData.expiresInMinutes)}
                onValueChange={(value: string) =>
                  ($formData.expiresInMinutes = Number(value))}
              >
                <Select.Trigger class="w-full"
                  ><span>{expiryLabel(Number($formData.expiresInMinutes))}</span
                  ></Select.Trigger
                >
                <Select.Content
                  >{#each [15, 30, 60, 240, 1440] as minutes}<Select.Item
                      value={String(minutes)}
                      >{expiryLabel(minutes)}</Select.Item
                    >{/each}</Select.Content
                >
              </Select.Root>
            </label>
          </div>
          <div class="grid gap-4 sm:grid-cols-[1fr_140px]">
            <label class="grid gap-1.5 text-xs font-medium"
              >{m["collaboration.relay"]()}<Input
                bind:value={$formData.relayUrl}
                autocomplete="off"
                spellcheck="false"
              /></label
            >
            <label class="grid gap-1.5 text-xs font-medium"
              >{m["collaboration.max_peers"]()}<Input
                type="number"
                min="1"
                max="5"
                bind:value={$formData.maxPeers}
              /></label
            >
          </div>
          <p class="text-xs leading-5 text-[var(--app-text-muted)]">
            {m["collaboration.relay_help"]()}
          </p>
          <div class="flex justify-end">
            <Button type="submit" disabled={busy}
              >{#if busy}<LoaderCircle class="animate-spin" />{/if}<RadioTower
              />{m["collaboration.start"]()}</Button
            >
          </div>
        </form>
      {:else}
        <Tabs.Root bind:value={activeTab} class="min-h-0 gap-0">
          <Tabs.List
            class="mx-5 mt-4 grid grid-cols-3 bg-[var(--app-surface-raised)]"
          >
            <Tabs.Trigger value="invite"
              >{m["collaboration.tab_invite"]()}</Tabs.Trigger
            >
            <Tabs.Trigger value="access" class="gap-1.5"
              >{m[
                "collaboration.tab_access"
              ]()}{#if pendingDevices.length}<Badge
                  class="h-4 min-w-4 px-1 text-[9px]"
                  >{pendingDevices.length}</Badge
                >{/if}</Tabs.Trigger
            >
            <Tabs.Trigger value="activity"
              >{m["collaboration.tab_activity"]()}</Tabs.Trigger
            >
          </Tabs.List>

          <Tabs.Content value="invite" class="m-0 p-5">
            <div class="grid gap-5 md:grid-cols-[minmax(0,1fr)_224px]">
              <div>
                <div class="flex items-center gap-2">
                  <Signal size={16} class="text-[var(--app-success)]" />
                  <h2 class="text-sm font-semibold">
                    {m["collaboration.active"]()}
                  </h2>
                </div>
                <p class="mt-2 text-xs leading-5 text-[var(--app-text-muted)]">
                  {m["collaboration.invite_help"]()}
                </p>
                <div
                  class="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-3 text-xs"
                >
                  <span class="text-[var(--app-text-muted)]"
                    >{m["collaboration.connected_peers"]()}</span
                  ><strong class="text-right tabular-nums"
                    >{status.transport?.connectedPeers ?? 0} / {status.share
                      .maxPeers}</strong
                  >
                  <span class="text-[var(--app-text-muted)]"
                    >{m["collaboration.expires_at"]()}</span
                  ><strong class="text-right"
                    >{new Date(status.share.expiresAt).toLocaleString(
                      localeState.current,
                    )}</strong
                  >
                </div>
                {#if inviteUri}
                  <div class="mt-4 flex min-w-0 gap-2">
                    <Input
                      readonly
                      value={inviteUri}
                      class="min-w-0 font-mono text-[11px]"
                    /><Button
                      variant="outline"
                      size="icon"
                      aria-label={m["collaboration.copy_invite"]()}
                      onclick={copyInvite}
                      >{#if copied}<Check />{:else}<Clipboard />{/if}</Button
                    >
                  </div>
                {:else}
                  <div
                    class="mt-4 rounded-lg border border-dashed border-[var(--app-border)] px-4 py-5 text-center text-xs text-[var(--app-text-muted)]"
                  >
                    {m["collaboration.invite_rotated"]()}
                  </div>
                {/if}
                <div class="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onclick={refreshInvite}
                    ><RefreshCw />{m["collaboration.refresh_invite"]()}</Button
                  ><Button
                    variant="destructive"
                    size="sm"
                    onclick={() => (confirmStop = true)}
                    ><ShieldOff />{m["collaboration.stop"]()}</Button
                  >
                </div>
              </div>
              <div
                class="grid min-h-56 place-items-center rounded-lg border border-[var(--app-border)] bg-white p-3"
              >
                {#if qrDataUrl}<img
                    src={qrDataUrl}
                    width="200"
                    height="200"
                    alt={m["collaboration.qr_alt"]()}
                    class="aspect-square w-full"
                  />{:else}<KeyRound size={28} class="text-neutral-400" />{/if}
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="access" class="m-0 space-y-5 p-5">
            <section>
              <h2
                class="text-xs font-semibold uppercase text-[var(--app-text-muted)]"
              >
                {m["collaboration.pending"]()} · {pendingDevices.length}
              </h2>
              <div class="mt-2 space-y-2">
                {#each pendingDevices as device (device.id)}
                  <div
                    class="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--app-warning)]/35 bg-[var(--app-warning)]/5 p-3"
                  >
                    <span
                      class="grid size-8 place-items-center rounded-lg bg-[var(--app-surface-raised)]"
                      ><Laptop size={15} /></span
                    >
                    <div class="min-w-32 flex-1">
                      <p class="text-sm font-medium">{device.displayName}</p>
                      <p
                        class="mt-0.5 font-mono text-[10px] text-[var(--app-text-muted)]"
                      >
                        {device.fingerprint}
                      </p>
                    </div>
                    <Select.Root
                      type="single"
                      value={roleDrafts[device.id]}
                      onValueChange={(value: string) =>
                        (roleDrafts = {
                          ...roleDrafts,
                          [device.id]: value as CollaborationRole,
                        })}
                    >
                      <Select.Trigger size="sm"
                        ><span
                          >{roleLabel(
                            roleDrafts[device.id] ?? device.role,
                          )}</span
                        ></Select.Trigger
                      >
                      <Select.Content
                        >{#each ["viewer", "collaborator", "operator", "administrator"] as role}<Select.Item
                            value={role}
                            >{roleLabel(role as CollaborationRole)}</Select.Item
                          >{/each}</Select.Content
                      >
                    </Select.Root>
                    <Button
                      size="sm"
                      disabled={busy}
                      onclick={() => decide(device, true)}
                      ><UserCheck />{m["collaboration.approve"]()}</Button
                    >
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onclick={() => decide(device, false)}
                      ><UserX />{m["collaboration.reject"]()}</Button
                    >
                  </div>
                {:else}<p
                    class="rounded-lg border border-dashed border-[var(--app-border)] p-5 text-center text-xs text-[var(--app-text-muted)]"
                  >
                    {m["collaboration.no_pending"]()}
                  </p>{/each}
              </div>
            </section>
            <section>
              <h2
                class="text-xs font-semibold uppercase text-[var(--app-text-muted)]"
              >
                {m["collaboration.approved"]()} · {approvedDevices.length}
              </h2>
              <div
                class="mt-2 divide-y divide-[var(--app-border)] rounded-lg border border-[var(--app-border)]"
              >
                {#each approvedDevices as device (device.id)}
                  <div class="flex flex-wrap items-center gap-3 p-3">
                    <span class="size-2 rounded-full bg-[var(--app-success)]"
                    ></span>
                    <div class="min-w-32 flex-1">
                      <p class="truncate text-sm font-medium">
                        {device.displayName}
                      </p>
                      <p
                        class="mt-0.5 text-[10px] text-[var(--app-text-muted)]"
                      >
                        {device.fingerprint}
                      </p>
                    </div>
                    <Select.Root
                      type="single"
                      value={roleDrafts[device.id]}
                      onValueChange={(value: string) =>
                        (roleDrafts = {
                          ...roleDrafts,
                          [device.id]: value as CollaborationRole,
                        })}
                      ><Select.Trigger size="sm"
                        ><span
                          >{roleLabel(
                            roleDrafts[device.id] ?? device.role,
                          )}</span
                        ></Select.Trigger
                      ><Select.Content
                        >{#each ["viewer", "collaborator", "operator", "administrator"] as role}<Select.Item
                            value={role}
                            >{roleLabel(role as CollaborationRole)}</Select.Item
                          >{/each}</Select.Content
                      ></Select.Root
                    >{#if roleDrafts[device.id] !== device.role}<Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onclick={() => decide(device, true)}
                        >{m["collaboration.update_access"]()}</Button
                      >{/if}<Button
                      variant="ghost"
                      size="sm"
                      onclick={() => (pendingRevoke = device)}
                      >{m["collaboration.revoke"]()}</Button
                    >
                  </div>
                {:else}<p
                    class="p-5 text-center text-xs text-[var(--app-text-muted)]"
                  >
                    {m["collaboration.no_devices"]()}
                  </p>{/each}
              </div>
            </section>
          </Tabs.Content>

          <Tabs.Content value="activity" class="m-0 p-5">
            <div
              class="divide-y divide-[var(--app-border)] rounded-lg border border-[var(--app-border)]"
            >
              {#each status.audit as event (event.id)}
                <div class="flex gap-3 p-3">
                  <Clock3
                    size={14}
                    class="mt-0.5 shrink-0 text-[var(--app-text-muted)]"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-medium">
                      {eventLabel(event.eventType)}
                    </p>
                    <p class="mt-1 text-[10px] text-[var(--app-text-muted)]">
                      {new Date(event.createdAt).toLocaleString(
                        localeState.current,
                      )}
                    </p>
                  </div>
                </div>
              {:else}<p
                  class="p-6 text-center text-xs text-[var(--app-text-muted)]"
                >
                  {m["collaboration.audit_empty"]()}
                </p>{/each}
            </div>
          </Tabs.Content>
        </Tabs.Root>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root
  open={confirmStop}
  onOpenChange={(open) => !open && (confirmStop = false)}
>
  <AlertDialog.Content
    ><AlertDialog.Header
      ><AlertDialog.Title
        >{m["collaboration.stop_confirm_title"]()}</AlertDialog.Title
      ><AlertDialog.Description
        >{m["collaboration.stop_confirm_body"]()}</AlertDialog.Description
      ></AlertDialog.Header
    ><AlertDialog.Footer
      ><AlertDialog.Cancel>{m["settings.cancel"]()}</AlertDialog.Cancel
      ><AlertDialog.Action disabled={busy} onclick={stopSharing}
        >{m["collaboration.stop"]()}</AlertDialog.Action
      ></AlertDialog.Footer
    ></AlertDialog.Content
  >
</AlertDialog.Root>

<AlertDialog.Root
  open={pendingRevoke !== null}
  onOpenChange={(open) => !open && (pendingRevoke = null)}
>
  <AlertDialog.Content
    ><AlertDialog.Header
      ><AlertDialog.Title
        >{m["collaboration.revoke_confirm_title"]()}</AlertDialog.Title
      ><AlertDialog.Description
        >{m["collaboration.revoke_confirm_body"]({
          name: pendingRevoke?.displayName ?? "",
        })}</AlertDialog.Description
      ></AlertDialog.Header
    ><AlertDialog.Footer
      ><AlertDialog.Cancel>{m["settings.cancel"]()}</AlertDialog.Cancel
      ><AlertDialog.Action disabled={busy} onclick={revoke}
        >{m["collaboration.revoke"]()}</AlertDialog.Action
      ></AlertDialog.Footer
    ></AlertDialog.Content
  >
</AlertDialog.Root>
