import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { AgentName, ChatMessage, Conversation, ConversationMode } from '../domain/types.js';
import { dataRoot, ensureLocalStorage } from './workspace.js';

type MessageRow = {
  id: string;
  conversation_id: string;
  participant: ChatMessage['participant'];
  content: string;
  metadata_json: string | null;
  created_at: string;
};

type ConversationRow = {
  id: string;
  title: string;
  mode: ConversationMode;
  project_path: string | null;
  created_at: string;
  updated_at: string;
};

type AgentRunInput = {
  id: string;
  conversationId: string;
  agent: AgentName;
  mode: string;
  prompt: string;
  startedAt: string;
};

let db: Database.Database | null = null;

function now() {
  return new Date().toISOString();
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    projectPath: row.project_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    participant: row.participant,
    content: row.content,
    createdAt: row.created_at,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
  };
}

export function getAgentRoomDb() {
  if (db) return db;

  ensureLocalStorage();
  db = new Database(resolve(dataRoot, 'app.sqlite'));
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      project_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      participant TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      mode TEXT NOT NULL,
      prompt TEXT NOT NULL,
      output TEXT,
      raw_output TEXT,
      exit_code INTEGER,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
  `);

  return db;
}

export const agentRoomRepository = {
  listConversations() {
    return getAgentRoomDb()
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
      .all()
      .map((row) => mapConversation(row as ConversationRow));
  },

  getConversation(id: string) {
    const row = getAgentRoomDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    return row ? mapConversation(row as ConversationRow) : null;
  },

  createConversation(input: { title: string; mode: ConversationMode; projectPath?: string | null }) {
    const createdAt = now();
    const conversation: Conversation = {
      id: randomUUID(),
      title: input.title.trim() || 'Nova conversa',
      mode: input.mode,
      projectPath: input.projectPath ?? null,
      createdAt,
      updatedAt: createdAt,
    };

    getAgentRoomDb()
      .prepare(
        'INSERT INTO conversations (id, title, mode, project_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        conversation.id,
        conversation.title,
        conversation.mode,
        conversation.projectPath,
        conversation.createdAt,
        conversation.updatedAt
      );

    return conversation;
  },

  renameConversation(id: string, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle) {
      throw new Error('O nome da conversa nao pode ficar vazio.');
    }

    getAgentRoomDb()
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(nextTitle, now(), id);

    return this.getConversation(id);
  },

  deleteConversation(id: string) {
    const database = getAgentRoomDb();
    const deleteWithChildren = database.transaction((conversationId: string) => {
      database.prepare('DELETE FROM agent_runs WHERE conversation_id = ?').run(conversationId);
      database.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
      return database.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId).changes;
    });

    return deleteWithChildren(id) > 0;
  },

  touchConversation(id: string) {
    getAgentRoomDb().prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now(), id);
  },

  listMessages(conversationId: string) {
    return getAgentRoomDb()
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId)
      .map((row) => mapMessage(row as MessageRow));
  },

  addMessage(input: {
    conversationId: string;
    participant: ChatMessage['participant'];
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    const message: ChatMessage = {
      id: randomUUID(),
      conversationId: input.conversationId,
      participant: input.participant,
      content: input.content,
      createdAt: now(),
      metadata: input.metadata,
    };

    getAgentRoomDb()
      .prepare(
        'INSERT INTO messages (id, conversation_id, participant, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        message.id,
        message.conversationId,
        message.participant,
        message.content,
        message.metadata ? JSON.stringify(message.metadata) : null,
        message.createdAt
      );
    this.touchConversation(input.conversationId);

    return message;
  },

  createAgentRun(input: AgentRunInput) {
    getAgentRoomDb()
      .prepare(
        'INSERT INTO agent_runs (id, conversation_id, agent, mode, prompt, started_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(input.id, input.conversationId, input.agent, input.mode, input.prompt, input.startedAt);
  },

  finishAgentRun(input: {
    id: string;
    output: string;
    rawOutput?: string;
    exitCode: number;
    error?: string;
    finishedAt: string;
  }) {
    getAgentRoomDb()
      .prepare(
        'UPDATE agent_runs SET output = ?, raw_output = ?, exit_code = ?, error = ?, finished_at = ? WHERE id = ?'
      )
      .run(input.output, input.rawOutput ?? null, input.exitCode, input.error ?? null, input.finishedAt, input.id);
  },
};
