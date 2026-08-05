<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as m from '$lib/paraglide/messages.js';
  import {
    ArrowLeft, Cable, FolderPlus, GitBranch, Layers, Repeat, Rocket, Search, Sparkles, Users, Workflow,
  } from '@lucide/svelte';
  import { toursCatalog, startTour } from './engine.svelte.js';
  import type { Tour } from './types.js';

  type Workspace = { id: string; name: string };

  type Props = {
    open: boolean;
    onClose: () => void;
    /** Cria o workspace e devolve o criado (pagina seleciona ele). */
    onCreateWorkspace: (input: { name: string; workingDir: string }) => Promise<Workspace | null>;
    /** Workspace ativo para iniciar o tour (se ja existir um). */
    activeWorkspaceId: string | null;
  };

  let { open, onClose, onCreateWorkspace, activeWorkspaceId }: Props = $props();

  const ICONS: Record<string, typeof Users> = { Users, Repeat, GitBranch, Workflow, Search, FolderPlus, Cable, Rocket, Layers };

  type WizardStep = 'welcome' | 'workspace' | 'usecase';
  let step = $state<WizardStep>('welcome');
  let name = $state('');
  let workingDir = $state('');
  let creating = $state(false);
  let createError = $state('');
  let workspaceId = $state<string | null>(null);
  let pickedTour = $state<Tour | null>(null);

  const desktop =
    typeof window !== 'undefined'
      ? (window as unknown as { orkestraiDesktop?: { pickDirectory: () => Promise<string | null> } }).orkestraiDesktop
      : undefined;

  $effect(() => {
    if (open) {
      step = activeWorkspaceId ? 'usecase' : 'welcome';
      workspaceId = activeWorkspaceId;
      createError = '';
      pickedTour = null;
    }
  });

  async function pickDirectory() {
    if (!desktop) return;
    const dir = await desktop.pickDirectory();
    if (dir) workingDir = dir;
  }

  async function createWorkspace() {
    if (!name.trim() || !workingDir.trim()) return;
    creating = true;
    createError = '';
    const created = await onCreateWorkspace({ name: name.trim(), workingDir: workingDir.trim() });
    creating = false;
    if (!created) {
      createError = m['onboarding.create_error']();
      return;
    }
    workspaceId = created.id;
    step = 'usecase';
  }

  async function begin(tour: Tour) {
    if (!workspaceId) return;
    await startTour(tour.id, workspaceId);
    onClose();
  }

  const tours = $derived(toursCatalog());
</script>

<Dialog.Root {open} onOpenChange={(isOpen) => !isOpen && onClose()}>
  <Dialog.Content class="{step === 'usecase' ? 'sm:max-w-3xl' : 'sm:max-w-2xl'} wizard-content">
    {#if step === 'welcome'}
      <div class="wizard-center">
        <span class="wizard-icon"><Sparkles size={26} /></span>
        <h2 class="wizard-title">{m['onboarding.welcome_title']()}</h2>
        <p class="wizard-sub">{m['onboarding.welcome_body']()}</p>
        <div class="wizard-actions">
          <Button onclick={() => (step = 'workspace')}>{m['onboarding.ws_create']()}</Button>
          <Button variant="ghost" onclick={() => (step = 'usecase')}>{m['onboarding.ws_skip']()}</Button>
        </div>
      </div>
    {:else if step === 'workspace'}
      <Dialog.Header>
        <Dialog.Title>{m['onboarding.ws_title']()}</Dialog.Title>
        <Dialog.Description>{m['onboarding.ws_body']()}</Dialog.Description>
      </Dialog.Header>
      <div class="wizard-form">
        <div class="field">
          <span class="field-label">{m['onboarding.ws_name']()}</span>
          <Input bind:value={name} placeholder={m['ph.onboarding_name']()} />
        </div>
        <div class="field">
          <span class="field-label">{m['onboarding.ws_dir']()}</span>
          <div class="dir-row">
            <Input bind:value={workingDir} placeholder={m['ph.onboarding_dir']()} class="flex-1" />
            {#if desktop}
              <Button variant="outline" size="sm" onclick={pickDirectory}>
                <FolderPlus size={14} aria-hidden="true" />
              </Button>
            {/if}
          </div>
        </div>
        {#if createError}<p class="wizard-error">{createError}</p>{/if}
      </div>
      <Dialog.Footer>
        <Button variant="ghost" onclick={() => (step = 'welcome')}>{m['onboarding.back']()}</Button>
        <Button disabled={creating || !name.trim() || !workingDir.trim()} onclick={createWorkspace}>
          {creating ? '...' : m['onboarding.ws_create']()}
        </Button>
      </Dialog.Footer>
    {:else}
      <Dialog.Header>
        <Dialog.Title>{m['onboarding.pick_title']()}</Dialog.Title>
        <Dialog.Description>{m['onboarding.pick_body']()}</Dialog.Description>
      </Dialog.Header>
      <div class="tour-grid">
        {#each tours as tour (tour.id)}
          {@const Icon = ICONS[tour.icon] ?? Sparkles}
          <button
            class="tour-card"
            class:picked={pickedTour?.id === tour.id}
            onclick={() => (pickedTour = tour)}
            ondblclick={() => begin(tour)}
          >
            <span class="tour-card-icon"><Icon size={15} aria-hidden="true" /></span>
            <span class="tour-card-text">
              <span class="tour-card-title">{tour.title}</span>
              <span class="tour-card-tagline">{tour.tagline}</span>
            </span>
          </button>
        {/each}
      </div>
      <Dialog.Footer>
        <Button variant="ghost" onclick={onClose}>{m['onboarding.later']()}</Button>
        <Button disabled={!pickedTour || !workspaceId} onclick={() => pickedTour && begin(pickedTour)}>
          {m['onboarding.start']()}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  .wizard-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 20px 8px;
    text-align: center;
  }

  .wizard-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: rgba(91, 141, 239, 0.14);
    color: #7de5ff;
  }

  .wizard-title {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 19px;
    font-weight: 600;
    margin: 0;
  }

  .wizard-sub {
    margin: 0;
    font-size: 13px;
    line-height: 1.65;
    color: #a9aab3;
    max-width: 420px;
    text-wrap: pretty;
  }

  .wizard-actions {
    display: flex;
    gap: 10px;
    margin-top: 6px;
  }

  .wizard-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 12px;
    font-weight: 500;
    color: #a9aab3;
  }

  .dir-row {
    display: flex;
    gap: 8px;
  }

  .wizard-error {
    margin: 0;
    font-size: 12px;
    color: #ff9c9f;
  }

  .tour-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 8px;
    max-height: 46vh;
    overflow-y: auto;
    /* Espaco para o anel de foco/selecao respirar — com 2px ele era cortado
       pelo overflow nas bordas do grid. */
    padding: 6px;
    /* Fade sutil no rodape para o corte do scroll nao parecer erro. */
    mask-image: linear-gradient(to bottom, black calc(100% - 28px), transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 28px), transparent 100%);
  }

  .tour-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    cursor: pointer;
    text-align: left;
    transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
  }

  .tour-card:hover {
    background: rgba(255, 255, 255, 0.06);
    transform: translateY(-1px);
  }

  /* Anel de foco customizado: fica dentro do respiro do grid, nunca corta. */
  .tour-card:focus-visible {
    outline: 2px solid rgba(124, 93, 255, 0.75);
    outline-offset: 1px;
  }

  .tour-card.picked {
    border-color: rgba(124, 93, 255, 0.65);
    background: rgba(124, 93, 255, 0.12);
    box-shadow: inset 0 0 0 1px rgba(124, 93, 255, 0.25);
  }

  .tour-card-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: rgba(91, 141, 239, 0.14);
    color: #7de5ff;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .tour-card-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .tour-card-title {
    font-size: 12.5px;
    font-weight: 600;
    color: #e6e6eb;
    text-wrap: balance;
  }

  .tour-card-tagline {
    font-size: 11px;
    color: #8b8c96;
    line-height: 1.45;
    text-wrap: pretty;
  }
</style>
