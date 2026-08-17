/**
 * Servidor MCP (Model Context Protocol) do Orkestrai — stdio, JSON-RPC 2.0
 * NDJSON (uma mensagem JSON por linha, como manda a spec de transporte stdio
 * do MCP). Expoe as acoes do canvas como TOOLS nativas e tipadas para
 * qualquer agente que fala MCP (Claude Code, Kimi etc.) — em vez de parsear
 * saida de shell.
 *
 * Entrada tolera AMBOS os framings (NDJSON e Content-Length estilo LSP —
 * este ultimo existia na primeira versao; clientes oficiais usam NDJSON).
 * Saida e sempre NDJSON.
 *
 * Sem dependencias: protocolo minimo (initialize, ping, tools/list,
 * tools/call) sobre a bridge HTTP existente (token do workspace).
 */

const PROTOCOL_VERSION = '2024-11-05';

/** Tools expostas (inputSchema JSON Schema). args -> bridge no callTool(). */
const TOOLS = [
  { name: 'list', description: 'Lista agentes do workspace (titulo, provider, sessao viva) e suas notas/portais conectados.', inputSchema: { type: 'object', properties: {} } },
  { name: 'usage', description: 'Consulta cotas dos providers e a recomendacao de roteamento configurada no no Usage do canvas.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ask', description: 'Envia mensagem a outro agente e aguarda resposta confirmada. So afirme que conversou quando replyConfirmed for true.', inputSchema: { type: 'object', properties: { agent: { type: 'string', description: 'Titulo do agente' }, message: { type: 'string' } }, required: ['agent', 'message'] } },
  { name: 'note_read', description: 'Le uma nota pelo nodeId.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'note_write', description: 'Substitui o conteudo de uma nota.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, content: { type: 'string' } }, required: ['nodeId', 'content'] } },
  { name: 'note_edit', description: 'Edicao pontual: troca um trecho da nota.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } }, required: ['nodeId', 'oldText', 'newText'] } },
  { name: 'note_create', description: 'Cria uma nota no canvas (conecta ao time por padrao).', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, connect: { type: 'string', description: 'Titulo de agente ou "all"' } }, required: ['title'] } },
  { name: 'design_list', description: 'Lista documentos de design nativos do workspace e suas revisoes.', inputSchema: { type: 'object', properties: {} } },
  { name: 'design_read', description: 'Le o scene graph completo de um Design node. Leia antes de alterar e use a revisao retornada.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'design_audit', description: 'Audita naming, clipping, overlap, contraste e acessibilidade sem alterar o documento.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'design_apply_template', description: 'Aplica um template nativo completo pelo command bus transacional.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, baseRevision: { type: 'number' }, templateId: { type: 'string', enum: ['product', 'marketing', 'mobile', 'design-system'] }, taskId: { type: 'string' } }, required: ['nodeId', 'baseRevision', 'templateId'] } },
  { name: 'design_apply_operations', description: 'Aplica operacoes transacionais ao documento: layers, vetores, design system, prototipo, motion, comentarios e propostas. Leia a revisao antes e verifique o resultado depois.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, baseRevision: { type: 'number' }, operations: { type: 'array', minItems: 1, maxItems: 2000, items: { type: 'object' } }, summary: { type: 'string' }, taskId: { type: 'string' } }, required: ['nodeId', 'baseRevision', 'operations', 'summary'] } },
  { name: 'design_comment', description: 'Cria um comentario rastreavel em uma pagina ou layer, com autoria do agente e suporte a mencoes no texto.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, baseRevision: { type: 'number' }, pageId: { type: 'string' }, elementId: { type: ['string', 'null'] }, body: { type: 'string' }, taskId: { type: 'string' } }, required: ['nodeId', 'baseRevision', 'pageId', 'body'] } },
  { name: 'design_propose', description: 'Submete operacoes visuais como proposta pendente para revisao humana, sem alterar o design aprovado.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, baseRevision: { type: 'number' }, title: { type: 'string' }, description: { type: 'string' }, operations: { type: 'array', minItems: 1, maxItems: 2000, items: { type: 'object' } }, floorId: { type: ['string', 'null'] }, councilId: { type: ['string', 'null'] }, taskId: { type: 'string' } }, required: ['nodeId', 'baseRevision', 'title', 'operations'] } },
  { name: 'design_decide_proposal', description: 'Aprova ou rejeita uma proposta visual pendente. A aprovacao aplica as operacoes validadas de forma transacional.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, baseRevision: { type: 'number' }, proposalId: { type: 'string' }, status: { type: 'string', enum: ['approved', 'rejected'] }, note: { type: ['string', 'null'] }, taskId: { type: 'string' } }, required: ['nodeId', 'baseRevision', 'proposalId', 'status'] } },
  { name: 'design_import_code', description: 'Importa HTML, Svelte, React/JSX ou Vue como elementos nativos editaveis no Design Studio e registra a alteracao no historico.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, baseRevision: { type: 'number' }, format: { type: 'string', enum: ['html', 'svelte', 'react', 'vue'] }, name: { type: 'string' }, markup: { type: 'string' }, css: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, parentId: { type: ['string', 'null'] }, summary: { type: 'string' }, taskId: { type: 'string' } }, required: ['nodeId', 'baseRevision', 'format', 'name', 'markup'] } },
  { name: 'design_generate_code_preview', description: 'Gera uma previa sem escrita para Svelar/Svelte, React/Next, Vue ou HTML/Tailwind. Retorna status, conteudo, mappings e hash esperado.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, framework: { type: 'string', enum: ['svelar', 'svelte', 'react', 'next', 'vue', 'html'] }, elementIds: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string' } }, outputPath: { type: 'string' }, componentName: { type: 'string' } }, required: ['nodeId', 'framework', 'elementIds', 'outputPath', 'componentName'] } },
  { name: 'design_generate_code_apply', description: 'Escreve codigo previamente revisado dentro do workspace, rejeita arquivo alterado e vincula o artefato ao documento de design.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, baseRevision: { type: 'number' }, framework: { type: 'string', enum: ['svelar', 'svelte', 'react', 'next', 'vue', 'html'] }, elementIds: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string' } }, outputPath: { type: 'string' }, componentName: { type: 'string' }, expectedExistingHash: { type: ['string', 'null'] }, summary: { type: 'string' }, taskId: { type: 'string' } }, required: ['nodeId', 'baseRevision', 'framework', 'elementIds', 'outputPath', 'componentName', 'expectedExistingHash'] } },
  { name: 'design_figma_inspect', description: 'Inspeciona um link oficial do Figma e lista paginas/frames importaveis sem alterar o documento.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, url: { type: 'string' } }, required: ['nodeId', 'url'] } },
  { name: 'design_figma_import', description: 'Importa frames do Figma como scene graph nativo, preservando o vinculo para sincronizacao.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, url: { type: 'string' }, sourceNodeIds: { type: 'array', items: { type: 'string' }, minItems: 1 }, baseRevision: { type: 'number' }, targetPageId: { type: 'string' } }, required: ['nodeId', 'url', 'sourceNodeIds', 'baseRevision', 'targetPageId'] } },
  { name: 'design_figma_sync_preview', description: 'Compara Figma e Orkestrai e classifica alteracoes remotas, locais e conflitos antes de escrever.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, linkId: { type: 'string' } }, required: ['nodeId', 'linkId'] } },
  { name: 'design_figma_sync_apply', description: 'Aplica resolucoes seletivas de sincronizacao Figma apos revisar o preview.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, linkId: { type: 'string' }, baseRevision: { type: 'number' }, changes: { type: 'array', items: { type: 'object', properties: { nodeId: { type: 'string' }, resolution: { type: 'string', enum: ['figma', 'local', 'delete'] } }, required: ['nodeId', 'resolution'] } } }, required: ['nodeId', 'linkId', 'baseRevision', 'changes'] } },
  { name: 'design_create_element', description: 'Cria frame, grupo, retangulo, elipse, texto, vetor ou imagem no documento. A operacao falha em revisao antiga, sem sobrescrever trabalho humano.', inputSchema: { type: 'object', properties: {
    nodeId: { type: 'string' }, baseRevision: { type: 'number' }, pageId: { type: 'string' }, parentId: { type: ['string', 'null'] },
    type: { type: 'string', enum: ['frame', 'group', 'rectangle', 'ellipse', 'text', 'path', 'image'] }, name: { type: 'string' },
    x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' },
    fill: { type: 'string' }, stroke: { type: 'string' }, strokeWidth: { type: 'number' }, cornerRadius: { type: 'number' },
    text: { type: 'string' }, fontSize: { type: 'number' }, fontWeight: { type: 'number' }, summary: { type: 'string' }, taskId: { type: 'string' },
  }, required: ['nodeId', 'baseRevision', 'pageId', 'type', 'name', 'x', 'y', 'width', 'height'] } },
  { name: 'design_update_element', description: 'Atualiza propriedades tipadas de um elemento existente no Design node.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, baseRevision: { type: 'number' }, elementId: { type: 'string' }, changes: { type: 'object' }, summary: { type: 'string' }, taskId: { type: 'string' } }, required: ['nodeId', 'baseRevision', 'elementId', 'changes'] } },
  { name: 'design_delete_element', description: 'Exclui um elemento e seus descendentes do Design node, respeitando lock e revisao.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, baseRevision: { type: 'number' }, elementId: { type: 'string' }, summary: { type: 'string' }, taskId: { type: 'string' } }, required: ['nodeId', 'baseRevision', 'elementId'] } },
  { name: 'task_list', description: 'Lista as tarefas do quadro (kanban) do workspace.', inputSchema: { type: 'object', properties: {} } },
  { name: 'task_columns', description: 'Lista as colunas e chaves validas do kanban.', inputSchema: { type: 'object', properties: {} } },
  { name: 'task_add', description: 'Cria tarefa; com assignee ja despacha para o agente.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string', description: 'Descricao em markdown (checklists, links)' }, assignee: { type: 'string' }, note: { type: 'string', description: 'Nota de spec (id ou titulo)' }, column: { type: 'string', description: 'Chave ou nome da coluna inicial' } }, required: ['title'] } },
  { name: 'task_move', description: 'Move uma tarefa para qualquer coluna do quadro.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, column: { type: 'string' } }, required: ['taskId', 'column'] } },
  { name: 'task_done', description: 'Marca tarefa como concluida e faz handoff automatico ao lider.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] } },
  { name: 'task_history', description: 'Historico do quadro (concluidas + arquivadas).', inputSchema: { type: 'object', properties: {} } },
  { name: 'portal_create', description: 'Cria um portal (browser) no canvas.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' }, connect: { type: 'string' } }, required: ['url'] } },
  { name: 'portal_navigate', description: 'Abre URL no portal.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, url: { type: 'string' } }, required: ['nodeId', 'url'] } },
  { name: 'portal_eval', description: 'Executa JS na pagina do portal e retorna o resultado.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, js: { type: 'string' } }, required: ['nodeId', 'js'] } },
  { name: 'portal_dom', description: 'Devolve o HTML atual do portal.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'portal_screenshot', description: 'Captura a tela do portal (base64).', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'floor_list', description: 'Lista andares (worktrees git) do workspace.', inputSchema: { type: 'object', properties: {} } },
  { name: 'floor_create', description: 'Cria um andar (worktree isolada com branch propria).', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'floor_preview', description: 'Previa da aterrissagem (merge) com conflitos.', inputSchema: { type: 'object', properties: { floorId: { type: 'string' } }, required: ['floorId'] } },
  { name: 'floor_land', description: 'Aterrissa o andar (merge da branch).', inputSchema: { type: 'object', properties: { floorId: { type: 'string' } }, required: ['floorId'] } },
  { name: 'device_list', description: 'Lista simuladores/dispositivos e a sessao Device ativa do workspace.', inputSchema: { type: 'object', properties: {} } },
  { name: 'device_attach', description: 'Inicia ou anexa um device ao painel do Workbench.', inputSchema: { type: 'object', properties: { deviceId: { type: 'string' }, platform: { type: 'string', enum: ['ios', 'android'] } }, required: ['deviceId', 'platform'] } },
  { name: 'device_tap', description: 'Toca coordenadas normalizadas 0..1 no device ativo.', inputSchema: { type: 'object', properties: { x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } }, required: ['x', 'y'] } },
  { name: 'device_swipe', description: 'Desliza entre coordenadas normalizadas no device ativo.', inputSchema: { type: 'object', properties: { fromX: { type: 'number' }, fromY: { type: 'number' }, toX: { type: 'number' }, toY: { type: 'number' }, durationMs: { type: 'number' } }, required: ['fromX', 'fromY', 'toX', 'toY'] } },
  { name: 'device_pinch', description: 'Executa pinch com dois toques em coordenadas normalizadas no device ativo.', inputSchema: { type: 'object', properties: { centerX: { type: 'number', minimum: 0, maximum: 1 }, centerY: { type: 'number', minimum: 0, maximum: 1 }, startDistance: { type: 'number', minimum: 0.02, maximum: 0.9 }, endDistance: { type: 'number', minimum: 0.02, maximum: 0.9 }, durationMs: { type: 'number' } }, required: ['centerX', 'centerY', 'startDistance', 'endDistance'] } },
  { name: 'device_type', description: 'Digita texto no campo focado do device ativo.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'device_button', description: 'Pressiona um botao de sistema do device ativo.', inputSchema: { type: 'object', properties: { button: { type: 'string', enum: ['back', 'home', 'lock', 'app-switcher'] } }, required: ['button'] } },
  { name: 'device_rotate', description: 'Muda a orientacao do device ativo.', inputSchema: { type: 'object', properties: { orientation: { type: 'string', enum: ['portrait', 'portrait_upside_down', 'landscape_left', 'landscape_right'] } }, required: ['orientation'] } },
  { name: 'device_install', description: 'Instala um app do workspace no device ativo.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'device_launch', description: 'Abre um bundle/package no device ativo.', inputSchema: { type: 'object', properties: { bundleId: { type: 'string' } }, required: ['bundleId'] } },
  { name: 'device_logs', description: 'Le logs recentes e limitados do device ativo.', inputSchema: { type: 'object', properties: { minutes: { type: 'number', minimum: 1, maximum: 30 } } } },
  { name: 'device_tree', description: 'Le a arvore de acessibilidade limitada do device ativo.', inputSchema: { type: 'object', properties: {} } },
  { name: 'device_permissions', description: 'Lista ou altera explicitamente uma permissao do app no device ativo.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'grant', 'revoke', 'reset'] }, permission: { type: 'string', enum: ['notifications', 'location', 'camera', 'microphone', 'photos', 'photos-add', 'contacts', 'calendar', 'reminders', 'motion', 'media-library', 'siri', 'speech', 'faceid', 'user-tracking', 'homekit', 'all'] }, bundleId: { type: 'string' }, value: { type: 'string' } }, required: ['action'] } },
  { name: 'device_screenshot', description: 'Salva um screenshot no diretorio .orkestrai do workspace.', inputSchema: { type: 'object', properties: {} } },
  { name: 'device_stop', description: 'Desanexa e limpa o helper do device ativo.', inputSchema: { type: 'object', properties: {} } },
  { name: 'notify', description: 'Notificacao nativa de atencao ou conclusao do projeto. task_done ja notifica tarefas.', inputSchema: { type: 'object', properties: { message: { type: 'string' }, kind: { type: 'string', enum: ['info', 'attention', 'project', 'task'] }, title: { type: 'string' } }, required: ['message'] } },
  { name: 'status', description: 'Registra o estado semantico e a acao atual deste agente no Control Center.', inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['starting', 'working', 'waiting_input', 'waiting_permission', 'blocked', 'idle', 'done', 'error', 'disconnected'] }, action: { type: 'string' }, taskId: { type: 'string' } }, required: ['state'] } },
  { name: 'port', description: 'Devolve uma porta livre para subir servidores.', inputSchema: { type: 'object', properties: {} } },
  { name: 'recruit', description: '(maestro) Recruta agente novo no canvas.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, provider: { type: 'string', description: 'Id de um provider registrado no Orkestrai.' }, role: { type: 'string' } }, required: ['title'] } },
  { name: 'dismiss', description: '(maestro) Dispensa um agente.', inputSchema: { type: 'object', properties: { agent: { type: 'string' } }, required: ['agent'] } },
];

/** Mapeia tool -> chamada da bridge (mesmos endpoints da CLI). */
async function callTool(bridge, findFreePort, selfAgent, name, args = {}) {
  switch (name) {
    case 'list': {
      const query = selfAgent ? `?agentNodeId=${encodeURIComponent(selfAgent)}` : '';
      return bridge('GET', `/api/agent-room/bridge/agents${query}`);
    }
    case 'usage':
      return bridge('GET', '/api/agent-room/bridge/usage');
    case 'ask':
      return bridge('POST', '/api/agent-room/bridge/ask', { to: args.agent, message: args.message, from: selfAgent });
    case 'note_read':
      return bridge('GET', `/api/agent-room/bridge/notes/${encodeURIComponent(args.nodeId)}`);
    case 'note_write':
      return bridge('PUT', `/api/agent-room/bridge/notes/${encodeURIComponent(args.nodeId)}`, { content: args.content });
    case 'note_edit':
      return bridge('PATCH', `/api/agent-room/bridge/notes/${encodeURIComponent(args.nodeId)}`, { old: args.oldText, new: args.newText });
    case 'note_create':
      return bridge('POST', '/api/agent-room/bridge/notes', { title: args.title, content: args.content, connect: args.connect ?? 'all', from: selfAgent });
    case 'design_list':
      return bridge('GET', '/api/agent-room/bridge/designs');
    case 'design_read':
      return bridge('GET', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}`);
    case 'design_audit':
      return bridge('GET', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}/quality`);
    case 'design_apply_template':
      return bridge('POST', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}/quality`, {
        baseRevision: args.baseRevision,
        templateId: args.templateId,
        from: selfAgent,
        taskId: args.taskId,
      });
    case 'design_apply_operations':
      return bridge('PATCH', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}`, {
        baseRevision: args.baseRevision,
        operations: args.operations,
        summary: args.summary,
        from: selfAgent,
        taskId: args.taskId,
      });
    case 'design_comment': {
      const now = new Date().toISOString();
      const author = { kind: 'agent', id: selfAgent || 'agent', name: selfAgent || 'Agent', color: '#059669' };
      return bridge('PATCH', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}`, {
        baseRevision: args.baseRevision,
        operations: [{ kind: 'add-design-comment', comment: {
          id: crypto.randomUUID(), pageId: args.pageId, elementId: args.elementId ?? null,
          x: null, y: null, status: 'open', messages: [{ id: crypto.randomUUID(), author, body: args.body, mentions: [], createdAt: now }],
          createdAt: now, updatedAt: now, resolvedAt: null, resolvedBy: null,
        } }],
        summary: 'Agent design comment', from: selfAgent, taskId: args.taskId,
      });
    }
    case 'design_propose': {
      const now = new Date().toISOString();
      return bridge('PATCH', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}`, {
        baseRevision: args.baseRevision,
        operations: [{ kind: 'add-design-proposal', proposal: {
          id: crypto.randomUUID(), title: args.title, description: args.description ?? '',
          author: { kind: 'agent', id: selfAgent || 'agent', name: selfAgent || 'Agent', color: '#059669' },
          baseRevision: args.baseRevision, operations: args.operations, status: 'pending',
          floorId: args.floorId ?? null, councilId: args.councilId ?? null,
          createdAt: now, updatedAt: now, decidedAt: null, decidedBy: null, decisionNote: null,
        } }],
        summary: `Agent design proposal: ${args.title}`, from: selfAgent, taskId: args.taskId,
      });
    }
    case 'design_decide_proposal':
      return bridge('PATCH', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}`, {
        baseRevision: args.baseRevision,
        operations: [{ kind: 'decide-design-proposal', proposalId: args.proposalId, status: args.status,
          actor: { kind: 'agent', id: selfAgent || 'agent', name: selfAgent || 'Agent', color: '#059669' }, note: args.note ?? null }],
        summary: `Agent design proposal ${args.status}`, from: selfAgent, taskId: args.taskId,
      });
    case 'design_import_code':
      return bridge('POST', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}/delivery/import`, {
        baseRevision: args.baseRevision,
        format: args.format,
        name: args.name,
        markup: args.markup,
        css: args.css ?? '',
        x: args.x ?? 80,
        y: args.y ?? 80,
        parentId: args.parentId ?? null,
        summary: args.summary,
        from: selfAgent,
        taskId: args.taskId,
      });
    case 'design_generate_code_preview':
      return bridge('POST', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}/delivery/preview`, {
        framework: args.framework,
        elementIds: args.elementIds,
        outputPath: args.outputPath,
        componentName: args.componentName,
      });
    case 'design_generate_code_apply':
      return bridge('POST', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}/delivery/apply`, {
        baseRevision: args.baseRevision,
        framework: args.framework,
        elementIds: args.elementIds,
        outputPath: args.outputPath,
        componentName: args.componentName,
        expectedExistingHash: args.expectedExistingHash,
        summary: args.summary,
        from: selfAgent,
        taskId: args.taskId,
      });
    case 'design_figma_inspect':
      return bridge('POST', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}/figma/inspect`, { url: args.url });
    case 'design_figma_import':
      return bridge('POST', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}/figma/import`, { url: args.url, sourceNodeIds: args.sourceNodeIds, baseRevision: args.baseRevision, targetPageId: args.targetPageId });
    case 'design_figma_sync_preview':
      return bridge('POST', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}/figma/sync`, { linkId: args.linkId });
    case 'design_figma_sync_apply':
      return bridge('PATCH', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}/figma/sync`, { linkId: args.linkId, baseRevision: args.baseRevision, changes: args.changes });
    case 'design_create_element': {
      const { nodeId, baseRevision, summary, taskId, ...element } = args;
      return bridge('PATCH', `/api/agent-room/bridge/designs/${encodeURIComponent(nodeId)}`, {
        baseRevision,
        operations: [{ kind: 'create', element: { ...element, parentId: element.parentId ?? null } }],
        summary: summary ?? `Create ${element.type} ${element.name}`,
        from: selfAgent,
        taskId,
      });
    }
    case 'design_update_element':
      return bridge('PATCH', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}`, {
        baseRevision: args.baseRevision,
        operations: [{ kind: 'update', elementId: args.elementId, changes: args.changes }],
        summary: args.summary ?? `Update design element ${args.elementId}`,
        from: selfAgent,
        taskId: args.taskId,
      });
    case 'design_delete_element':
      return bridge('PATCH', `/api/agent-room/bridge/designs/${encodeURIComponent(args.nodeId)}`, {
        baseRevision: args.baseRevision,
        operations: [{ kind: 'delete', elementId: args.elementId }],
        summary: args.summary ?? `Delete design element ${args.elementId}`,
        from: selfAgent,
        taskId: args.taskId,
      });
    case 'task_list':
      return bridge('GET', '/api/agent-room/bridge/tasks');
    case 'task_columns':
      return bridge('GET', '/api/agent-room/bridge/task-columns');
    case 'task_add':
      return bridge('POST', '/api/agent-room/bridge/tasks', { title: args.title, description: args.description, assignee: args.assignee, note: args.note, status: args.column, from: selfAgent });
    case 'task_move':
      return bridge('PATCH', `/api/agent-room/bridge/tasks/${encodeURIComponent(args.taskId)}`, { status: args.column });
    case 'task_done':
      return bridge('PATCH', `/api/agent-room/bridge/tasks/${encodeURIComponent(args.taskId)}`, { status: 'done', from: selfAgent });
    case 'task_history':
      return bridge('GET', '/api/agent-room/bridge/tasks/history');
    case 'portal_create': {
      if (!selfAgent) throw new Error('identidade do agente desconhecida (ORKESTRAI_NODE_ID ausente) — crie o portal pelo canvas ou pela CLI dentro do terminal de um agente.');
      return bridge('POST', '/api/agent-room/bridge/portal/create', { url: args.url, title: args.title, connect: args.connect, from: selfAgent });
    }
    case 'portal_navigate':
      return bridge('POST', '/api/agent-room/bridge/portal', { nodeId: args.nodeId, action: 'navigate', args: { url: args.url } });
    case 'portal_eval':
      return bridge('POST', '/api/agent-room/bridge/portal', { nodeId: args.nodeId, action: 'eval', args: { js: args.js } });
    case 'portal_dom':
      return bridge('POST', '/api/agent-room/bridge/portal', { nodeId: args.nodeId, action: 'dom', args: {} });
    case 'portal_screenshot':
      return bridge('POST', '/api/agent-room/bridge/portal', { nodeId: args.nodeId, action: 'screenshot', args: {} });
    case 'floor_list':
      return bridge('GET', '/api/agent-room/bridge/floors');
    case 'floor_create':
      return bridge('POST', '/api/agent-room/bridge/floors', { name: args.name });
    case 'floor_preview':
      return bridge('GET', `/api/agent-room/bridge/floors/${encodeURIComponent(args.floorId)}/preview`);
    case 'floor_land':
      return bridge('POST', `/api/agent-room/bridge/floors/${encodeURIComponent(args.floorId)}/land`, {});
    case 'device_list':
      return bridge('GET', '/api/agent-room/bridge/devices');
    case 'device_attach':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'start', deviceId: args.deviceId, platform: args.platform });
    case 'device_tap':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'tap', x: args.x, y: args.y });
    case 'device_swipe':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'swipe', fromX: args.fromX, fromY: args.fromY, toX: args.toX, toY: args.toY, durationMs: args.durationMs ?? 300 });
    case 'device_pinch':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'pinch', centerX: args.centerX, centerY: args.centerY, startDistance: args.startDistance, endDistance: args.endDistance, durationMs: args.durationMs ?? 300 });
    case 'device_type':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'type', text: args.text });
    case 'device_button':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'button', button: args.button });
    case 'device_rotate':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'rotate', orientation: args.orientation });
    case 'device_install':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'install', path: args.path });
    case 'device_launch':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'launch', bundleId: args.bundleId });
    case 'device_logs':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'logs', minutes: args.minutes ?? 2 });
    case 'device_tree':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'tree' });
    case 'device_permissions':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'permissions', action: args.action, permission: args.permission, bundleId: args.bundleId, value: args.value });
    case 'device_screenshot':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'screenshot' });
    case 'device_stop':
      return bridge('POST', '/api/agent-room/bridge/devices', { command: 'stop' });
    case 'notify':
      return bridge('POST', '/api/agent-room/bridge/notify', { message: args.message, kind: args.kind, title: args.title, from: selfAgent });
    case 'status': {
      if (!selfAgent) throw new Error('identidade do agente desconhecida (ORKESTRAI_NODE_ID ausente).');
      return bridge('POST', '/api/agent-room/bridge/activity', { from: selfAgent, state: args.state, action: args.action, taskId: args.taskId });
    }
    case 'port':
      return { port: await findFreePort() };
    case 'recruit': {
      if (!selfAgent) throw new Error('identidade do agente desconhecida (ORKESTRAI_NODE_ID ausente) — recruit so funciona dentro do terminal do maestro.');
      return bridge('POST', '/api/agent-room/bridge/recruit', { title: args.title, provider: args.provider, role: args.role, from: selfAgent });
    }
    case 'dismiss': {
      if (!selfAgent) throw new Error('identidade do agente desconhecida (ORKESTRAI_NODE_ID ausente) — dismiss so funciona dentro do terminal do maestro.');
      return bridge('POST', '/api/agent-room/bridge/dismiss', { target: args.agent, from: selfAgent });
    }
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

/** Envia uma mensagem JSON-RPC em NDJSON (spec stdio do MCP: 1 JSON por linha). */
function writeMessage(write, message) {
  write(`${JSON.stringify(message)}\n`);
}

/**
 * Loop principal do servidor MCP. Io injetavel para testes:
 * input = stream legivel (stdin), write = funcao de escrita (stdout).
 * bridge = (method, path, body) => Promise<data> ja autenticada.
 */
export async function runMcpServer({ input, write, bridge, findFreePort, selfAgent = null, version = '0.0.1' }) {
  let buffer = Buffer.alloc(0);
  const pending = [];
  let waiter = null;
  let ended = false;

  const pump = () => {
    for (;;) {
      // Framing LSP legado (Content-Length) — tolerado na entrada.
      if (buffer.subarray(0, 15).toString('utf8').startsWith('Content-Length')) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = buffer.subarray(0, headerEnd).toString('utf8');
        const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1] ?? 0);
        if (!length) {
          buffer = buffer.subarray(headerEnd + 4);
          continue;
        }
        if (buffer.length < headerEnd + 4 + length) return;
        const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8');
        buffer = buffer.subarray(headerEnd + 4 + length);
        try {
          pending.push(JSON.parse(body));
        } catch {
          // mensagem quebrada — ignora
        }
        waiter?.();
        continue;
      }
      // NDJSON (spec stdio do MCP): uma mensagem por linha.
      const lineEnd = buffer.indexOf('\n');
      if (lineEnd === -1) return;
      const line = buffer.subarray(0, lineEnd).toString('utf8').trim();
      buffer = buffer.subarray(lineEnd + 1);
      if (!line) continue;
      try {
        pending.push(JSON.parse(line));
      } catch {
        // linha quebrada — ignora
      }
      waiter?.();
    }
  };

  input.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    pump();
  });
  const markEnded = () => {
    ended = true;
    waiter?.();
  };
  input.on('end', markEnded);
  input.on('close', markEnded);

  const nextMessage = () =>
    new Promise((resolveNext) => {
      if (pending.length) return resolveNext(pending.shift());
      if (ended) return resolveNext(null);
      waiter = () => {
        waiter = null;
        resolveNext(pending.length ? pending.shift() : null);
      };
      pump();
    });

  input.resume?.();

  for (;;) {
    const message = await nextMessage();
    if (!message) {
      if (ended) break; // stdin fechou: encerra limpo (clients e testes)
      continue;
    }
    // Notificacoes (sem id) nao tem resposta.
    if (message.id === undefined || message.id === null) continue;
    const reply = (result) => writeMessage(write, { jsonrpc: '2.0', id: message.id, result });
    const fail = (error) =>
      writeMessage(write, { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
    try {
      if (message.method === 'initialize') {
        reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'orkestrai', version },
        });
      } else if (message.method === 'ping') {
        reply({});
      } else if (message.method === 'tools/list') {
        reply({ tools: TOOLS });
      } else if (message.method === 'tools/call') {
        const { name, arguments: toolArgs } = message.params ?? {};
        try {
          const data = await callTool(bridge, findFreePort, selfAgent, name, toolArgs);
          reply({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
        } catch (error) {
          reply({ content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true });
        }
      } else {
        writeMessage(write, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Metodo nao suportado: ${message.method}` } });
      }
    } catch (error) {
      fail(error);
    }
  }
}

export const MCP_TOOLS = TOOLS;
