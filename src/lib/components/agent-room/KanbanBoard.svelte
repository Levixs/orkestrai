<script lang="ts">
  import { Trash2 } from '@lucide/svelte';
  import type { AgentTask, TaskStatus, TeamMember } from '$lib/modules/agent-room/domain/types.js';

  let {
    tasks = [],
    members = [],
    busy = false,
    onDelete,
  }: {
    tasks: AgentTask[];
    members: TeamMember[];
    busy?: boolean;
    onDelete: (task: AgentTask) => void;
  } = $props();

  const columns: Array<{ status: TaskStatus; label: string }> = [
    { status: 'backlog', label: 'Backlog' },
    { status: 'in_progress', label: 'Em progresso' },
    { status: 'testing', label: 'Em testes' },
    { status: 'done', label: 'Finalizado' },
  ];

  function assigneeName(id: string | null) {
    return members.find((member) => member.id === id)?.title ?? 'Sem responsavel';
  }
</script>

<section class="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-[#dedbd2] bg-white">
  <header class="flex min-h-12 items-center justify-between gap-3 border-b border-[#eeeae1] px-3.5 py-3">
    <div>
      <strong class="block text-sm leading-tight">Kanban</strong>
      <span class="text-xs text-[#69665f]">Estado persistido do loop</span>
    </div>
  </header>

  <div class="grid min-h-0 grid-flow-col auto-cols-[minmax(170px,1fr)] gap-2 overflow-auto p-2.5">
    {#each columns as column}
      {@const columnTasks = tasks.filter((task) => task.status === column.status)}
      <section class="flex min-w-0 flex-col gap-2 rounded-lg border border-[#e2ded4] bg-[#faf9f5] p-2">
        <div class="flex min-h-6 items-center justify-between gap-2 text-xs font-extrabold text-[#36332e]">
          <span>{column.label}</span>
          <small class="min-w-5 rounded-full bg-[#e8e2d6] text-center text-[11px] text-[#514d45]">{columnTasks.length}</small>
        </div>
        {#if columnTasks.length}
          {#each columnTasks as task}
            <article class="grid gap-2 rounded-lg border border-[#dedbd2] bg-white p-2.5">
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <strong class="min-w-0 text-xs leading-tight [overflow-wrap:anywhere]">{task.title}</strong>
                <button
                  class="inline-flex size-7 items-center justify-center rounded-md border border-[#d6d2c8] bg-white text-[#5f574c] hover:border-[#9d3e24] hover:text-[#9d3e24] disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onclick={() => onDelete(task)}
                  disabled={busy}
                  aria-label={`Remover task ${task.title}`}
                  aria-label="Remover task"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <p class="m-0 line-clamp-4 min-w-0 overflow-hidden text-[11px] leading-snug text-[#5d5951]">{task.description}</p>
              <footer class="flex items-center justify-between gap-2 text-[11px] text-[#69665f]">
                <span>{assigneeName(task.assigneeId)}</span>
                {#if task.blockedReason}
                  <em class="font-extrabold not-italic text-[#9d3e24]">Bloqueada</em>
                {/if}
              </footer>
            </article>
          {/each}
        {:else}
          <p class="m-0 text-xs text-[#8a857b]">Sem cards</p>
        {/if}
      </section>
    {/each}
  </div>
</section>
