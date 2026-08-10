import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { getAgentAdapter, hasAgentAdapter } from '../../application/adapters/registry.js';

/**
 * Le a ULTIMA resposta do agente direto do transcrito da CLI (JSONL em disco)
 * — fonte limpa, sem ANSI/TUI, com a resposta COMPLETA. Substitui a raspagem
 * da tela do terminal (que quebrava em redraws, molduras e caracteres de
 * controle) para a fala de resposta no ciclo de ditado.
 *
 * Formatos:
 * - claude: ~/.claude/projects/<slug>/<sessionId>.jsonl
 *   {type:'assistant', message:{content:[{type:'text',text}|{type:'tool_use'}]}}
 *   {type:'user', message:{content: string | [{type:'tool_result'}]}}
 * - codex: ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
 *   {type:'response_item', payload:{type:'message', role, content:[{type:'output_text',text}]}}
 * - kimi: ~/.kimi-code/sessions/<wd_*>/session_<uuid>/*.jsonl (melhor esforco,
 *   mesmo contrato role/content; fallback null -> raspagem de tela)
 */

/** Lida a cauda do arquivo (transcritos longos nao cabem inteiros na memoria). */
const TAIL_BYTES = 512 * 1024;

function readTail(path: string): string | null {
  try {
    const size = statSync(path).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buffer = readFileSync(path);
    const tail = buffer.subarray(start).toString('utf8');
    // Se cortou no meio, joga fora a primeira linha parcial.
    return start > 0 ? tail.slice(tail.indexOf('\n') + 1) : tail;
  } catch {
    return null;
  }
}

/** Claude: textos do(s) bloco(s) assistant depois da ultima msg de usuario real. */
export function parseClaudeTranscriptReply(jsonl: string): string | null {
  const parts: string[] = [];
  for (const line of jsonl.trim().split('\n').reverse()) {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'assistant') {
      const content = event.message?.content;
      if (!Array.isArray(content)) continue;
      const texts = content
        .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text.trim())
        .filter(Boolean);
      // Assistant com texto vira parte da resposta; so-tool_use segue subindo.
      if (texts.length) parts.unshift(texts.join('\n'));
      continue;
    }
    if (event.type === 'user') {
      const content = event.message?.content;
      const realUser =
        typeof content === 'string'
          ? content.trim().length > 0
          : Array.isArray(content) && content.some((block: any) => block?.type === 'text' && String(block.text ?? '').trim().length > 0);
      if (realUser) break; // fronteira: a pergunta ditada — para aqui
    }
  }
  const text = parts.join('\n\n').trim();
  return text || null;
}

/** Codex: response_item/message assistant (output_text) depois do ultimo user. */
export function parseCodexTranscriptReply(jsonl: string): string | null {
  const parts: string[] = [];
  for (const line of jsonl.trim().split('\n').reverse()) {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = event.payload ?? event;
    if (payload?.type !== 'message' || !Array.isArray(payload.content)) continue;
    // output_text = assistant; input_text/text = fronteira do usuario.
    const texts = payload.content
      .filter((block: any) => ['output_text', 'text', 'input_text'].includes(block?.type) && typeof block.text === 'string')
      .map((block: any) => block.text.trim())
      .filter(Boolean);
    if (!texts.length) continue;
    if (payload.role === 'assistant') {
      parts.unshift(texts.join('\n'));
      continue;
    }
    if (payload.role === 'user') break;
  }
  const text = parts.join('\n\n').trim();
  return text || null;
}

/** Kimi/opencode: tentativa generica role/content (melhor esforco). */
export function parseGenericTranscriptReply(jsonl: string): string | null {
  const events: unknown[] = [];
  for (const line of jsonl.trim().split('\n')) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Ignora linhas parciais enquanto o agente grava o transcrito.
    }
  }
  return parseStructuredMessagesReply(events);
}

/** Cursor, Cline e Antigravity: formatos variam, mas preservam role + content. */
export function parseStructuredMessagesReply(messages: unknown[]): string | null {
  const parts: string[] = [];
  for (const raw of [...messages].reverse()) {
    if (!raw || typeof raw !== 'object') continue;
    const event = raw as Record<string, any>;
    const message = event.message && typeof event.message === 'object' ? event.message : event.payload ?? event;
    const role = String(message.role ?? message.author?.role ?? message.speaker ?? message.type ?? event.role ?? event.type ?? '').toLowerCase();
    const text = transcriptText(message.content ?? message.parts ?? message.text ?? message.output ?? message.response);
    if (!text) continue;
    if (['assistant', 'agent', 'model'].includes(role)) {
      parts.unshift(text);
      continue;
    }
    if (['user', 'human'].includes(role)) break;
  }
  const text = parts.join('\n\n').trim();
  return text || null;
}

/** Devin (ATIF JSON): passos agent depois do ultimo passo user. */
export function parseDevinTranscriptReply(json: string): string | null {
  let payload: { steps?: unknown };
  try {
    payload = JSON.parse(json) as { steps?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(payload.steps)) return null;

  const parts: string[] = [];
  for (const raw of [...payload.steps].reverse()) {
    if (!raw || typeof raw !== 'object') continue;
    const step = raw as Record<string, unknown>;
    const source = String(step.source ?? '').toLowerCase();
    if (source === 'user') break;
    if (source !== 'agent') continue;
    const text = transcriptText(step.message) ?? transcriptText(step.reasoning_content);
    if (text) parts.unshift(text);
  }
  return parts.join('\n\n').trim() || null;
}

function transcriptText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.map(transcriptText).filter((part): part is string => Boolean(part));
    return parts.length ? parts.join('\n') : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.type && !['text', 'output_text', 'message'].includes(String(record.type)) && !('text' in record)) return null;
  return transcriptText(record.text ?? record.content ?? record.value);
}

/**
 * Kimi (wire.jsonl): textos do assistente depois do ultimo turn.prompt.
 *   user:      {"type":"turn.prompt","input":[{"type":"text","text":...}]}
 *   assistant: {"type":"context.append_loop_event","event":{"type":"content.part","part":{"type":"text","text":...}}}
 */
export function parseKimiTranscriptReply(jsonl: string): string | null {
  const parts: string[] = [];
  for (const line of jsonl.trim().split('\n').reverse()) {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'turn.prompt') break; // fronteira: a pergunta
    if (event.type === 'context.append_loop_event' && event.event?.type === 'content.part') {
      const part = event.event.part;
      if (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
        parts.unshift(part.text.trim());
      }
    }
  }
  const text = parts.join('\n\n').trim();
  return text || null;
}

function realCwd(cwd: string): string {
  try {
    return realpathSync(cwd);
  } catch {
    return resolve(cwd);
  }
}

function claudeTranscriptPath(cwd: string, sessionId: string): string {
  const slug = realCwd(cwd).replace(/[^a-zA-Z0-9]/g, '-');
  return join(homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
}

function findCodexTranscript(sessionId: string): string | null {
  const root = join(homedir(), '.codex', 'sessions');
  if (!existsSync(root)) return null;
  const walk = (dir: string, depth: number): string | null => {
    if (depth > 4) return null;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full, depth + 1);
        if (found) return found;
      } else if (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl') && entry.name.includes(sessionId)) {
        return full;
      }
    }
    return null;
  };
  return walk(root, 0);
}

function findKimiTranscript(sessionId: string): string | null {
  const root = join(homedir(), '.kimi-code', 'sessions');
  if (!existsSync(root)) return null;
  // sessionId vem como "session_<uuid>" (ver AgentSessionTracker).
  const walk = (dir: string, depth: number): string | null => {
    if (depth > 4) return null;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === sessionId) {
          // Formato real (0.33+): <sessao>/agents/main/wire.jsonl.
          const wire = join(full, 'agents', 'main', 'wire.jsonl');
          if (existsSync(wire)) return wire;
          // Fallback: o jsonl mais recente direto na sessao.
          try {
            const files = readdirSync(full)
              .filter((name) => name.endsWith('.jsonl'))
              .map((name) => ({ name, mtime: statSync(join(full, name)).mtimeMs }))
              .sort((a, b) => b.mtime - a.mtime);
            if (files[0]) return join(full, files[0].name);
          } catch {
            return null;
          }
        }
        const found = walk(full, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root, 0);
}

function cursorTranscriptPath(cwd: string, sessionId: string): string | null {
  const slug = realCwd(cwd).replace(/^[\\/]+/, '').replace(/[^a-zA-Z0-9]/g, '-');
  for (const projectSlug of [slug, `-${slug}`]) {
    const path = join(homedir(), '.cursor', 'projects', projectSlug, 'agent-transcripts', sessionId, `${sessionId}.jsonl`);
    if (existsSync(path)) return path;
  }
  return null;
}

function antigravityTranscriptPath(sessionId: string): string | null {
  const path = join(homedir(), '.gemini', 'antigravity-cli', 'brain', sessionId, '.system_generated', 'logs', 'transcript.jsonl');
  return existsSync(path) ? path : null;
}

function clineMessagesPath(sessionId: string): string | null {
  const root = join(homedir(), '.cline', 'data', 'sessions', sessionId);
  const manifestPath = join(root, `${sessionId}.json`);
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { messages_path?: unknown };
    const configured = typeof manifest.messages_path === 'string' ? manifest.messages_path : null;
    const path = configured || join(root, `${sessionId}.messages.json`);
    return existsSync(path) ? path : null;
  } catch {
    const fallback = join(root, `${sessionId}.messages.json`);
    return existsSync(fallback) ? fallback : null;
  }
}

function devinTranscriptPath(sessionId: string): string | null {
  const candidates = [
    process.env.XDG_DATA_HOME ? join(process.env.XDG_DATA_HOME, 'devin', 'cli', 'transcripts', `${sessionId}.json`) : '',
    join(homedir(), '.local', 'share', 'devin', 'cli', 'transcripts', `${sessionId}.json`),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'devin', 'cli', 'transcripts', `${sessionId}.json`) : '',
    join(homedir(), 'AppData', 'Local', 'devin', 'cli', 'transcripts', `${sessionId}.json`),
  ];
  return candidates.find((path) => Boolean(path) && existsSync(path)) ?? null;
}

/**
 * Ultima resposta do agente pelo transcrito da CLI (null = indisponivel —
 * quem chama cai na raspagem de tela como fallback).
 */
export async function lastReplyText(provider: string, cwd: string, sessionId: string): Promise<string | null> {
  try {
    const storage = hasAgentAdapter(provider) ? getAgentAdapter(provider).sessionStorage : undefined;
    if (storage === 'claude-project-jsonl') {
      const path = claudeTranscriptPath(cwd, sessionId);
      if (!existsSync(path)) return null;
      const jsonl = readTail(path);
      return jsonl ? parseClaudeTranscriptReply(jsonl) : null;
    }
    if (storage === 'codex-rollout-jsonl') {
      const path = findCodexTranscript(sessionId);
      if (!path) return null;
      const jsonl = readTail(path);
      return jsonl ? parseCodexTranscriptReply(jsonl) : null;
    }
    if (storage === 'kimi-session-dir') {
      const path = findKimiTranscript(sessionId);
      if (!path) return null;
      const jsonl = readTail(path);
      return jsonl ? parseKimiTranscriptReply(jsonl) : null;
    }
    if (storage === 'cursor-transcript-jsonl') {
      const path = cursorTranscriptPath(cwd, sessionId);
      const jsonl = path ? readTail(path) : null;
      return jsonl ? parseGenericTranscriptReply(jsonl) : null;
    }
    if (storage === 'antigravity-workspace-cache') {
      const path = antigravityTranscriptPath(sessionId);
      const jsonl = path ? readTail(path) : null;
      return jsonl ? parseGenericTranscriptReply(jsonl) : null;
    }
    if (storage === 'cline-session-manifest') {
      const path = clineMessagesPath(sessionId);
      if (!path) return null;
      const payload = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      if (Array.isArray(payload)) return parseStructuredMessagesReply(payload);
      const messages = payload && typeof payload === 'object'
        ? (payload as { messages?: unknown }).messages
        : null;
      return Array.isArray(messages) ? parseStructuredMessagesReply(messages) : null;
    }
    if (storage === 'devin-session-db') {
      const path = devinTranscriptPath(sessionId);
      return path ? parseDevinTranscriptReply(readFileSync(path, 'utf8')) : null;
    }
    return null;
  } catch {
    return null;
  }
}
