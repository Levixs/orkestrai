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

export type AgentProviderSetup = {
  /** Documentacao oficial de instalacao e autenticacao. */
  docsUrl: string;
  /** Instaladores oficiais que podem ser copiados pela Central de Providers. */
  installCommands?: Partial<Record<'darwin' | 'windows' | 'linux', string>>;
};

/**
 * Metadados publicos de um adapter de agente, expostos pela rota
 * /api/agent-room/status para a UI montar seletores dinamicamente.
 */
export type AgentProviderInfo = {
  id: AgentProviderId;
  displayName: string;
  supportsResume: boolean;
  efforts?: string[];
  sessionStorage?: string;
  setup?: AgentProviderSetup;
  installed?: boolean;
  detail?: string;
  /** Comando TUI interativo do agente para sessoes PTY. */
  tui?: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    resumeArgs?: string[] | null;
    /** Args exatos com o token abaixo no lugar do id real da conversa. */
    exactResumeArgs?: string[] | null;
    /** Args de conversa nova com o token abaixo no lugar do id reservado. */
    freshSessionArgs?: string[] | null;
  };
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

export type CanvasNodeType = 'terminal' | 'note' | 'fileTree' | 'editor' | 'diff' | 'portal' | 'apiClient' | 'loop' | 'group' | 'shape' | 'tasks' | 'flow' | 'image' | 'usage' | 'controlCenter' | 'reviewCenter' | 'automation' | 'device' | 'design';
export type CanvasEdgeStyle = 'cord' | 'circuit';
export type WorkspaceRuntimeKind = 'native' | 'wsl';
export type WorkspaceExecutionRuntime =
  | { kind: 'native' }
  | { kind: 'wsl'; distribution: string; linuxWorkingDir: string };

export type AgentActivityState =
  | 'starting'
  | 'working'
  | 'waiting_input'
  | 'waiting_permission'
  | 'blocked'
  | 'idle'
  | 'done'
  | 'error'
  | 'disconnected';

export type AgentMessageDeliveryState =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'acknowledged'
  | 'replied'
  | 'failed';

export type AgentActivity = {
  id: string;
  workspaceId: string;
  nodeId: string;
  state: AgentActivityState;
  action: string | null;
  taskId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AgentMessageDeliveryEvent = {
  id: string;
  messageId: string;
  workspaceId: string;
  fromNodeId: string | null;
  toNodeId: string;
  state: AgentMessageDeliveryState;
  content: string;
  reply: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AgentActivitySnapshot = {
  nodeId: string;
  title: string;
  provider: string | null;
  role: string | null;
  floorId: string | null;
  floorName: string | null;
  state: AgentActivityState;
  stateSince: string;
  lastAction: string | null;
  lastActionData: Record<string, unknown>;
  currentTask: { id: string; title: string; status: string } | null;
  sessionAlive: boolean;
};

export type AgentMessageThread = {
  messageId: string;
  workspaceId: string;
  fromNodeId: string | null;
  fromTitle: string | null;
  toNodeId: string;
  toTitle: string;
  state: AgentMessageDeliveryState;
  content: string;
  reply: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  events: AgentMessageDeliveryEvent[];
};

export type ControlCenterSnapshot = {
  workspaceId: string;
  counts: Record<AgentActivityState, number>;
  agents: AgentActivitySnapshot[];
  communications: AgentMessageThread[];
  generatedAt: string;
};

export type WorkspaceAttachment = {
  id: string;
  kind: 'file' | 'link';
  name: string;
  path: string | null;
  url: string | null;
  mimeType: string | null;
  size: number | null;
};

const RASTER_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function isRasterWorkspaceAttachment(attachment: WorkspaceAttachment): boolean {
  return attachment.kind === 'file' && RASTER_IMAGE_MIMES.has(attachment.mimeType ?? '');
}

export type Workspace = {
  id: string;
  name: string;
  workingDir: string;
  runtimeKind: WorkspaceRuntimeKind;
  wslDistribution: string | null;
  wslWorkingDir: string | null;
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
  agentSessionId?: string;
  /** Ultimo diretorio real de um shell puro; agentes sempre usam a raiz do trabalho. */
  currentWorkingDir?: string;
  /** Conversa persistida sumiu: inicia limpo, mas sem reinjetar o role. */
  resumeRecovery?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  provider?: AgentProviderId;
  /** Ausente = herda o ambiente padrão do workspace. */
  executionRuntime?: WorkspaceExecutionRuntime | null;
  role?: string | null;
  /** Args nativos da role, usados somente ao criar uma conversa nova. */
  initialRoleArgs?: string[];
  /** Nome da role representada por initialRoleArgs (permite reparo idempotente). */
  roleConfiguredAtLaunch?: string;
  /** Modo Maestro: pode recrutar/dispensar/conectar outros agentes via ponte. */
  maestro?: boolean;
  /** Identificador de um tema xterm embutido. */
  theme?: string;
};

export type NoteNodePayload = {
  content: string;
  locked?: boolean;
  attachments?: WorkspaceAttachment[];
};

export type UsageNodePayload = {
  enabled?: boolean;
  sourceProvider?: string;
  fallbackProvider?: string;
  windowKind?: '5h' | 'weekly' | 'monthly';
  thresholdPercent?: number;
};

export type ApiClientHeader = {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
};

export type ApiClientRequest = {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers: ApiClientHeader[];
  auth: {
    type: 'none' | 'bearer' | 'basic';
    token: string;
    username: string;
    password: string;
  };
  body: string;
  bodyMode: 'none' | 'json' | 'text' | 'xml' | 'form';
  sourcePath?: string | null;
};

export type ApiClientNodePayload = {
  sourceKind?: 'bruno' | 'postman' | null;
  sourcePath?: string | null;
  requests?: ApiClientRequest[];
  selectedRequestId?: string | null;
  variables?: Record<string, string>;
};

export type CanvasNodePayload = TerminalNodePayload | NoteNodePayload | ApiClientNodePayload | Record<string, unknown>;

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

export type WorkspaceSearchResultKind =
  | 'workspace'
  | 'agent'
  | 'task'
  | 'note'
  | 'artifact'
  | 'role'
  | 'skill'
  | 'automation'
  | 'file';

export type WorkspaceSearchResult = {
  id: string;
  kind: WorkspaceSearchResultKind;
  title: string;
  subtitle: string;
  preview: string | null;
  workspaceId: string;
  workspaceName: string;
  nodeId: string | null;
  taskId: string | null;
  path: string | null;
  route: string;
  score: number;
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

export type AutomationTriggerType =
  | 'manual'
  | 'schedule'
  | 'task'
  | 'message'
  | 'git_commit'
  | 'github_pull_request'
  | 'webhook'
  | 'file_change'
  | 'usage_threshold';

export type AutomationActionType = 'prompt_agent' | 'create_task' | 'notify';
export type AutomationRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type Routine = {
  id: string;
  workspaceId: string;
  name: string;
  targetNodeId: string | null;
  /** Prompt(s) a enviar ao terminal; multiplas etapas separadas por linha com &&. */
  prompt: string;
  /** Intervalo em minutos entre disparos (null = execucao unica). */
  intervalMinutes: number | null;
  enabled: boolean;
  lastRunAt: string | null;
  runCount: number;
  triggerType: AutomationTriggerType;
  triggerConfig: Record<string, unknown>;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  recipeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationRun = {
  id: string;
  routineId: string;
  ranAt: string;
  status: AutomationRunStatus;
  ok: boolean;
  triggerType: AutomationTriggerType;
  triggerKey: string | null;
  detail: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  agentNodeId: string | null;
  provider: string | null;
  usageBefore: unknown;
  usageAfter: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  attempt: number;
  retryOfId: string | null;
  recoverable: boolean;
};

export type AutomationIntegration = {
  id: string;
  workspaceId: string;
  type: 'github';
  name: string;
  config: { owner: string; repo: string };
  secretKey: string | null;
  status: 'connected' | 'disconnected' | 'error';
  lastCheckedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
