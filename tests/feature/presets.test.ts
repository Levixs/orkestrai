import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { presetService } from '$lib/modules/agent-room/application/services/PresetService.js';
import { roleService } from '$lib/modules/agent-room/application/services/RoleService.js';
import { routineService } from '$lib/modules/agent-room/application/services/RoutineService.js';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
import { mcpService } from '$lib/modules/agent-room/application/services/McpService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

describe('PresetService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('snapshot + apply em workspace novo: time, arestas, roles, rotinas e nota instanciados sem runtime', async () => {
    // Monta um workspace completo: lider + dev conectados, nota, role, rotina.
    const sourceDir = mkdtempSync(join(tmpdir(), 'orkestrai-preset-src-'));
    const source = await workspaceRepository.createWorkspace({ name: 'Origem', workingDir: sourceDir });
    const leader = await workspaceRepository.createNode({
      workspaceId: source.id,
      type: 'terminal',
      title: 'Lider',
      payload: { command: 'claude', provider: 'claude', maestro: true, sessionId: 'sessao-viva', agentSessionId: 'abc' },
    });
    const dev = await workspaceRepository.createNode({
      workspaceId: source.id,
      type: 'terminal',
      title: 'Dev',
      payload: { command: 'codex', provider: 'codex' },
    });
    const note = await workspaceRepository.createNode({
      workspaceId: source.id,
      type: 'note',
      title: 'Bootstrap',
      payload: { content: 'scaffold com o framework X' },
    });
    await workspaceRepository.createEdge({ workspaceId: source.id, sourceNodeId: leader.id, targetNodeId: dev.id });
    await workspaceRepository.createEdge({ workspaceId: source.id, sourceNodeId: note.id, targetNodeId: leader.id });
    await roleService.save(source.id, { name: 'Revisor', color: '#123456', prompt: 'so revisa' });
    await routineService.create({ workspaceId: source.id, targetNodeId: leader.id, prompt: 'verifique o quadro', intervalMinutes: 5 });
    // Tarefa-template vinculada ao lider + nota, e MCP extra no projeto.
    await taskBoardService.create(source.id, { title: 'Montar a base', assigneeNodeId: leader.id, noteId: note.id, createdBy: 'user' });
    await mcpService.add(source.id, { name: 'web', command: 'uvx', args: ['mcp-web'] });

    const preset = await presetService.createFromWorkspace(source.id, { name: 'Time Svelar', description: 'framework proprio' });
    expect(preset.agents).toBe(2);

    // Aplica num workspace NOVO (outra pasta).
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-preset-'));
    const applied = await presetService.apply(preset.id, { name: 'Projeto Novo', workingDir: dir });
    expect(applied.nodes).toBe(3);
    expect(applied.edges).toBe(2);
    expect(applied.roles).toBe(1);
    expect(applied.routines).toBe(1);

    const nodes = await workspaceRepository.listNodes(applied.workspaceId);
    const newLeader = nodes.find((node) => node.title === 'Lider');
    expect(newLeader).toBeTruthy();
    const leaderPayload = newLeader!.payload as Record<string, unknown>;
    // Runtime NAO viaja: sem sessao PTY nem session-id da CLI.
    expect(leaderPayload.sessionId).toBeUndefined();
    expect(leaderPayload.agentSessionId).toBeUndefined();
    expect(leaderPayload.maestro).toBe(true);

    // Arestas apontam para os NOVOS ids.
    const edges = await workspaceRepository.listEdges(applied.workspaceId);
    const ids = new Set(nodes.map((node) => node.id));
    for (const edge of edges) {
      expect(ids.has(edge.sourceNodeId)).toBe(true);
      expect(ids.has(edge.targetNodeId)).toBe(true);
    }

    // Role instalada no destino; rotina aponta para o NOVO lider.
    expect(await roleService.get(applied.workspaceId, 'Revisor')).toBeTruthy();
    const routines = await routineService.list(applied.workspaceId);
    expect(routines[0].targetNodeId).toBe(newLeader!.id);

    // Tarefa-template instanciada com responsavel e nota pelos NOVOS ids;
    // MCP extra aplicado no .mcp.json do projeto de destino.
    const tasks = await taskBoardService.list(applied.workspaceId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Montar a base');
    expect(tasks[0].assigneeNodeId).toBe(newLeader!.id);
    const newNote = nodes.find((node) => node.title === 'Bootstrap');
    expect(tasks[0].noteId).toBe(newNote!.id);
    const mcps = await mcpService.list(applied.workspaceId);
    expect(mcps.some((server) => server.name === 'web')).toBe(true);

    // Workspace destino com nome/pasta do usuario (nao do preset).
    const workspace = await workspaceRepository.getWorkspace(applied.workspaceId);
    expect(workspace!.name).toBe('Projeto Novo');
    expect(workspace!.workingDir).toBe(dir);
  });

  it('aplicar em workspace existente soma o time sem apagar o que existe', async () => {
    const source = await workspaceRepository.createWorkspace({ name: 'Base', workingDir: '/tmp' });
    const agent = await workspaceRepository.createNode({
      workspaceId: source.id,
      type: 'terminal',
      title: 'QA',
      x: 100,
      payload: { command: 'kimi', provider: 'kimi' },
    });
    const preset = await presetService.createFromWorkspace(source.id, { name: 'QA Solo' });

    const target = await workspaceRepository.createWorkspace({ name: 'Existente', workingDir: '/tmp' });
    const mine = await workspaceRepository.createNode({ workspaceId: target.id, type: 'note', title: 'Minha nota', x: 0 });
    const applied = await presetService.apply(preset.id, { workspaceId: target.id });

    const nodes = await workspaceRepository.listNodes(target.id);
    expect(nodes.some((node) => node.id === mine.id)).toBe(true); // existente intacto
    const qa = nodes.find((node) => node.title === 'QA');
    expect(qa).toBeTruthy();
    expect(qa!.id).not.toBe(agent.id); // id novo
    expect(qa!.x).toBeGreaterThan(100); // offset para nao colidir
    expect(applied.nodes).toBe(1);
  });

  it('remove preset', async () => {
    const source = await workspaceRepository.createWorkspace({ name: 'Tmp', workingDir: '/tmp' });
    const preset = await presetService.createFromWorkspace(source.id, { name: 'Descartavel' });
    expect(await presetService.remove(preset.id)).toBe(true);
    expect(await presetService.list()).toHaveLength(0);
  });
});
