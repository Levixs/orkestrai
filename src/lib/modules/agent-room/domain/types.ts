/**
 * Identificador de um provider/agente registrado no registry de adapters
 * (`application/adapters/registry.ts`). Os ids embutidos 'codex' e 'claude'
 * permanecem validos (dados existentes), mas qualquer adapter registrado
 * pode ser usado.
 */
export type AgentProviderId = 'codex' | 'claude' | (string & {});
export type AgentName = AgentProviderId;
export type Participant = 'user' | 'system' | AgentName;
export type TeamMemberRole = 'leader' | 'engineer' | 'tester' | 'designer' | 'documenter' | 'custom';
export type TeamMemberCapability = 'lead' | 'implement' | 'review' | 'test' | 'design' | 'document';
export type TaskStatus = 'backlog' | 'in_progress' | 'testing' | 'done';
export type ExecutionMode = 'sequential' | 'parallel';
export type ModelEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
export type ConversationMode = 'chat' | 'plan' | 'debate' | 'implement' | 'review' | 'project';
/**
 * Alvo de execucao: qualquer provider registrado, ou um dos fluxos
 * compostos embutidos (par codex/claude).
 */
export type AgentTarget =
  | AgentProviderId
  | 'both'
  | 'codex_then_claude_review'
  | 'claude_then_codex_review';

/**
 * Metadados publicos de um adapter de agente, expostos pela rota
 * /api/agent-room/status para a UI montar seletores dinamicamente.
 */
export type AgentProviderInfo = {
  id: AgentProviderId;
  displayName: string;
  supportsResume: boolean;
  installed?: boolean;
  detail?: string;
  /** Comando TUI interativo do agente para sessoes PTY. */
  tui?: { command: string; args: string[]; resumeArgs?: string[] | null };
  /** Modelos disponiveis no provider (para o dialogo de criacao). */
  models?: AgentModelOption[];
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  participant: Participant;  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type Conversation = {
  id: string;
  title: string;
  mode: ConversationMode;
  projectPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInfo = {
  name: string;
  path: string;
  createdAt: string;
};

export type AgentRunRequest = {
  agent: AgentName;
  memberId?: string;
  memberTitle?: string;
  taskId?: string;
  model?: string | null;
  effort?: ModelEffort | null;
  prompt: string;
  workingDirectory?: string;
  mode: Exclude<ConversationMode, 'project' | 'debate'>;
  allowWrites: boolean;
};

export type AgentRunResult = {
  agent: AgentName;
  memberId?: string;
  memberTitle?: string;
  content: string;
  rawOutput?: string;
  exitCode: number;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type RunAgentPayload = {
  message: string;
  target: AgentTarget;
  mode: Exclude<ConversationMode, 'project'>;
  allowWrites: boolean;
  projectPath?: string | null;
};

export type AgentLoopPayload = {
  message: string;
  mode: Exclude<ConversationMode, 'project'>;
  allowWrites: boolean;
  projectPath?: string | null;
  maxRounds?: number;
  executionMode?: ExecutionMode;
};

export type TeamMember = {
  id: string;
  conversationId: string;
  title: string;
  provider: AgentName;
  role: TeamMemberRole;
  model: string | null;
  effort: ModelEffort;
  canWrite: boolean;
  participatesInLoop: boolean;
  capabilities: TeamMemberCapability[];
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentTask = {
  id: string;
  conversationId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  assigneeId: string | null;
  createdByMemberId: string | null;
  acceptedByMemberId: string | null;
  blockedReason: string | null;
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskEvent = {
  id: string;
  conversationId: string;
  taskId: string;
  type: string;
  actorMemberId: string | null;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type CreateTeamMemberPayload = {
  title: string;
  provider: AgentName;
  role: TeamMemberRole;
  model?: string | null;
  effort?: ModelEffort;
  canWrite?: boolean;
  participatesInLoop?: boolean;
  capabilities?: TeamMemberCapability[];
  systemPrompt?: string;
};

export type UpdateTeamMemberPayload = Partial<CreateTeamMemberPayload>;

export type UpdateTaskPayload = {
  status?: TaskStatus;
  assigneeId?: string | null;
  title?: string;
  description?: string;
};

export type AgentModelOption = {
  provider: AgentName;
  value: string;
  label: string;
  description?: string;
  /** Esforcos suportados por ESTE modelo (quando a CLI informa). */
  efforts?: string[];
};

// ---------------------------------------------------------------------------
// Canvas / Workspaces
// ---------------------------------------------------------------------------

export type CanvasNodeType = 'terminal' | 'note' | 'fileTree' | 'editor' | 'diff' | 'portal' | 'loop' | 'group' | 'shape' | 'tasks' | 'flow' | 'image';
export type CanvasEdgeStyle = 'cord' | 'circuit';

export type Workspace = {
  id: string;
  name: string;
  workingDir: string;
  icon: string | null;
  instructions: string | null;
  /** Mantem CLAUDE.md e AGENTS.md sincronizados no working_dir. */
  syncAgentInstructionFiles: boolean;
  /** Hooks de ciclo de vida de andares (setup/run/teardown). */
  hooks: WorkspaceHooks;
  createdAt: string;
  updatedAt: string;
};

/** Payload por tipo de no (serializado em payload_json). */
export type TerminalNodePayload = {
  sessionId?: string;
  command?: string;
  args?: string[];
  provider?: AgentProviderId;
  role?: string | null;
  /** Modo Maestro: pode recrutar/dispensar/conectar outros agentes via ponte. */
  maestro?: boolean;
  /** Tema do terminal (dark, dracula, nord, solarized, light). */
  theme?: string;
};

export type NoteNodePayload = {
  content: string;
  locked?: boolean;
};

export type CanvasNodePayload = TerminalNodePayload | NoteNodePayload | Record<string, unknown>;

export type CanvasNode = {
  id: string;
  workspaceId: string;
  type: CanvasNodeType;
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  payload: CanvasNodePayload;
  /** Andar dono do no (null = terreo). */
  floorId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CanvasEdge = {
  id: string;
  workspaceId: string;
  sourceNodeId: string;
  targetNodeId: string;
  style: CanvasEdgeStyle;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Andares (floors) e automacao
// ---------------------------------------------------------------------------

export type Floor = {
  id: string;
  workspaceId: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'landed' | 'deleted';
  createdAt: string;
  updatedAt: string;
};

export type HookCommand = { command: string };

export type WorkspaceHooks = {
  setup?: HookCommand[];
  run?: HookCommand[];
  teardown?: HookCommand[];
  /** Executa os hooks de setup automaticamente ao criar um andar. */
  autoRunSetup?: boolean;
};

export type Routine = {
  id: string;
  workspaceId: string;
  targetNodeId: string;
  /** Prompt(s) a enviar ao terminal; multiplas etapas separadas por linha com &&. */
  prompt: string;
  /** Intervalo em minutos entre disparos (null = execucao unica). */
  intervalMinutes: number | null;
  enabled: boolean;
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
};
