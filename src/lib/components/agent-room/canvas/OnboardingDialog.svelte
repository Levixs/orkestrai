<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { SquareTerminal, SquareKanban, FolderPlus, Sparkles, ArrowLeft, ArrowRight, Check, Cable } from '@lucide/svelte';

  type Props = {
    open: boolean;
    onClose: () => void;
    /** Chamado no ultimo passo se o usuario quiser ja criar o workspace. */
    onCreateWorkspace: () => void;
  };

  let { open, onClose, onCreateWorkspace }: Props = $props();

  let step = $state(0);

  const STEPS = [
    {
      icon: Sparkles,
      title: 'Bem-vindo ao Orkestrai',
      body: 'Um canvas onde você monta times de agentes de IA (Claude, Codex, Kimi) trabalhando de verdade — em paralelo, cada um no seu terminal, no seu projeto.',
    },
    {
      icon: FolderPlus,
      title: '1. Crie um workspace',
      body: 'O workspace é a equipe: aponta para a pasta do projeto e guarda o layout do canvas. Clique no + da barra lateral (ou escolha a pasta nativa no app desktop).',
    },
    {
      icon: SquareTerminal,
      title: '2. Desenhe agentes no canvas',
      body: 'Clique em + Claude (ou Codex/Kimi) e clique ou arraste no canvas. Antes de criar, o Orkestrai pergunta: nome da janela, modelo, esforço de raciocínio e se ele é o líder da equipe. Depois, duplo-clique no título renomeia qualquer nó.',
    },
    {
      icon: Cable,
      title: '3. Conecte e distribua trabalho',
      body: 'Arraste da bolinha de um nó até outro para conectar — a corda acende quando eles conversam. Com o quadro Tarefas (kanban), você ou o líder criam cartões; atribuir despacha a tarefa direto pro terminal do agente. O líder (⭐ Maestro) recruta e demite o time sozinho.',
    },
  ];

  function finish(createWorkspace: boolean) {
    try {
      localStorage.setItem('orkestrai.onboarded', '1');
    } catch {
      // storage indisponivel — nao bloqueia
    }
    step = 0;
    if (createWorkspace) onCreateWorkspace();
    else onClose();
  }
</script>

<Dialog.Root {open} onOpenChange={(isOpen) => !isOpen && finish(false)}>
  <Dialog.Content class="sm:max-w-2xl">
    {@const current = STEPS[step]}
    <div class="flex flex-col items-center gap-4 py-4 text-center">
      <span class="onboard-icon">
        <current.icon size={28} />
      </span>
      <h2 class="text-lg font-semibold">{current.title}</h2>
      <p class="text-sm text-muted-foreground leading-relaxed max-w-md">{current.body}</p>

      <div class="flex items-center gap-1.5 pt-1">
        {#each STEPS as _, index (index)}
          <span class="onboard-dot" class:active={index === step}></span>
        {/each}
      </div>
    </div>

    <Dialog.Footer class="flex flex-wrap items-center justify-between gap-2 w-full">
      <Button variant="ghost" onclick={() => finish(false)}>Pular</Button>
      <div class="flex flex-wrap gap-2">
        {#if step > 0}
          <Button variant="outline" onclick={() => (step -= 1)}>
            <ArrowLeft size={14} /> Voltar
          </Button>
        {/if}
        {#if step < STEPS.length - 1}
          <Button onclick={() => (step += 1)}>
            Próximo <ArrowRight size={14} />
          </Button>
        {:else}
          <Button variant="outline" onclick={() => finish(false)}>Explorar sozinho</Button>
          <Button onclick={() => finish(true)}>
            <Check size={14} /> Criar workspace
          </Button>
        {/if}
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .onboard-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: rgba(91, 141, 239, 0.12);
    color: #7C4DFF;
  }

  .onboard-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    transition: background 150ms ease;
  }

  .onboard-dot.active {
    background: #7C4DFF;
  }
</style>
