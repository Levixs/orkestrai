import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

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
  return parseCodexTranscriptReply(jsonl);
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

/**
 * Ultima resposta do agente pelo transcrito da CLI (null = indisponivel —
 * quem chama cai na raspagem de tela como fallback).
 */
export async function lastReplyText(provider: string, cwd: string, sessionId: string): Promise<string | null> {
  try {
    if (provider === 'claude') {
      const path = claudeTranscriptPath(cwd, sessionId);
      if (!existsSync(path)) return null;
      const jsonl = readTail(path);
      return jsonl ? parseClaudeTranscriptReply(jsonl) : null;
    }
    if (provider === 'codex') {
      const path = findCodexTranscript(sessionId);
      if (!path) return null;
      const jsonl = readTail(path);
      return jsonl ? parseCodexTranscriptReply(jsonl) : null;
    }
    if (provider === 'kimi') {
      const path = findKimiTranscript(sessionId);
      if (!path) return null;
      const jsonl = readTail(path);
      return jsonl ? parseKimiTranscriptReply(jsonl) : null;
    }
    return null;
  } catch {
    return null;
  }
}
