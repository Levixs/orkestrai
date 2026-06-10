export type Participant = 'user' | 'codex' | 'claude' | 'system';
export type AgentName = 'codex' | 'claude';
export type ConversationMode = 'chat' | 'plan' | 'debate' | 'implement' | 'review' | 'project';
export type AgentTarget =
  | 'codex'
  | 'claude'
  | 'both'
  | 'codex_then_claude_review'
  | 'claude_then_codex_review';

export type ChatMessage = {
  id: string;
  conversationId: string;
  participant: Participant;
  content: string;
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
  prompt: string;
  workingDirectory?: string;
  mode: Exclude<ConversationMode, 'project' | 'debate'>;
  allowWrites: boolean;
};

export type AgentRunResult = {
  agent: AgentName;
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
};
