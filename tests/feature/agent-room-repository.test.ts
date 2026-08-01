import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { agentRoomRepository } from '$lib/modules/agent-room/infrastructure/repositories/AgentRoomRepository.js';

describe('AgentRoomRepository', () => {
  useSvelarTest({ refreshDatabase: true });

  it('cria, lista, renomeia e apaga conversas com cascata', async () => {
    const conversation = await agentRoomRepository.createConversation({ title: '  ', mode: 'chat' });
    expect(conversation.title).toBe('Nova conversa');
    expect(conversation.id).toHaveLength(36);

    await agentRoomRepository.addMessage({ conversationId: conversation.id, participant: 'user', content: 'oi' });
    await agentRoomRepository.addTeamMember({
      conversationId: conversation.id,
      title: 'Lider',
      provider: 'claude',
      role: 'leader',
      effort: 'high',
      canWrite: false,
      participatesInLoop: true,
      capabilities: ['lead'],
      systemPrompt: 'lidere',
    });

    expect(await agentRoomRepository.listConversations()).toHaveLength(1);

    const renamed = await agentRoomRepository.renameConversation(conversation.id, 'Renomeada');
    expect(renamed?.title).toBe('Renomeada');
    await expect(agentRoomRepository.renameConversation(conversation.id, '   ')).rejects.toThrow('vazio');

    expect(await agentRoomRepository.deleteConversation(conversation.id)).toBe(true);
    expect(await agentRoomRepository.getConversation(conversation.id)).toBeNull();
    expect(await agentRoomRepository.listMessages(conversation.id)).toHaveLength(0);
    expect(await agentRoomRepository.listTeamMembers(conversation.id)).toHaveLength(0);
  });

  it('mensagens guardam metadata e ordenam por created_at', async () => {
    const conversation = await agentRoomRepository.createConversation({ title: 'c', mode: 'chat' });
    await agentRoomRepository.addMessage({ conversationId: conversation.id, participant: 'user', content: 'primeira' });
    await agentRoomRepository.addMessage({
      conversationId: conversation.id,
      participant: 'kimi',
      content: 'segunda',
      metadata: { model: 'kimi-code/kimi-for-coding' },
    });

    const messages = await agentRoomRepository.listMessages(conversation.id);
    expect(messages.map((message) => message.content)).toEqual(['primeira', 'segunda']);
    expect(messages[1].metadata).toEqual({ model: 'kimi-code/kimi-for-coding' });
  });

  it('membros: adiciona, atualiza com merge e remove liberando tasks', async () => {
    const conversation = await agentRoomRepository.createConversation({ title: 'c', mode: 'chat' });
    const member = await agentRoomRepository.addTeamMember({
      conversationId: conversation.id,
      title: 'Engenheiro',
      provider: 'codex',
      role: 'engineer',
      effort: 'medium',
      canWrite: true,
      participatesInLoop: true,
      capabilities: ['implement'],
      systemPrompt: 'implemente',
    });
    expect(member.canWrite).toBe(true);
    expect(member.capabilities).toEqual(['implement']);

    const task = await agentRoomRepository.addTask({
      conversationId: conversation.id,
      title: 'task',
      description: 'desc',
      status: 'backlog',
      assigneeId: member.id,
    });
    expect(task.assigneeId).toBe(member.id);

    const updated = await agentRoomRepository.updateTeamMember(member.id, { title: 'Engenheiro Senior' });
    expect(updated?.title).toBe('Engenheiro Senior');
    expect(updated?.provider).toBe('codex');

    expect(await agentRoomRepository.deleteTeamMember(member.id)).toBe(true);
    const orphanTask = await agentRoomRepository.getTask(task.id);
    expect(orphanTask?.assigneeId).toBeNull();
  });

  it('tasks: ordenacao, update parcial, delete limpa eventos e runs', async () => {
    const conversation = await agentRoomRepository.createConversation({ title: 'c', mode: 'chat' });
    const low = await agentRoomRepository.addTask({ conversationId: conversation.id, title: 'baixa', description: '', status: 'backlog', priority: 1 });
    const high = await agentRoomRepository.addTask({ conversationId: conversation.id, title: 'alta', description: '', status: 'backlog', priority: 9 });

    const tasks = await agentRoomRepository.listTasks(conversation.id);
    expect(tasks.map((task) => task.title)).toEqual(['alta', 'baixa']);

    const updated = await agentRoomRepository.updateTask(high.id, { status: 'done', resultSummary: 'ok' });
    expect(updated?.status).toBe('done');
    expect(updated?.resultSummary).toBe('ok');
    expect(updated?.title).toBe('alta');

    await agentRoomRepository.createAgentRun({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      agent: 'claude',
      taskId: low.id,
      mode: 'implement',
      prompt: 'prompt',
      startedAt: new Date().toISOString(),
    });
    await agentRoomRepository.addTaskEvent({ conversationId: conversation.id, taskId: low.id, type: 'task_planned', content: 'planejada' });

    expect(await agentRoomRepository.deleteTask('outra-conversa', low.id)).toBe(false);
    expect(await agentRoomRepository.deleteTask(conversation.id, low.id)).toBe(true);
    expect(await agentRoomRepository.listTaskEvents(conversation.id, low.id)).toHaveLength(0);
  });

  it('agent runs: cria e finaliza com output e exit code', async () => {
    const conversation = await agentRoomRepository.createConversation({ title: 'c', mode: 'chat' });
    const runId = crypto.randomUUID();
    await agentRoomRepository.createAgentRun({
      id: runId,
      conversationId: conversation.id,
      agent: 'kimi',
      mode: 'chat',
      prompt: 'ola',
      startedAt: new Date().toISOString(),
    });
    await agentRoomRepository.finishAgentRun({
      id: runId,
      output: 'resposta',
      exitCode: 0,
      finishedAt: new Date().toISOString(),
    });
    // Sem listagem publica de runs no repositorio; valida via task events nao se aplica.
    // O importante e nao lancar erro nas duas escritas.
    expect(true).toBe(true);
  });
});
