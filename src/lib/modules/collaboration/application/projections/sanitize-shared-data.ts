const SENSITIVE_KEYS = /(^|_)(working_dir|path|session_id|agent_session_id|pid|command|args|env|token|secret|password|cookie|credential|api_key|bridge_token|url)$/i;
const TOKEN_PATTERNS = [
  /\b(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|sk-[a-zA-Z0-9_-]{20,})\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
];
const PATH_PATTERNS = [
  /\/(?:Users|home)\/[^\s"'`]+/g,
  /\b[A-Za-z]:\\[^\s"'`]+/g,
];
const PRIVATE_URL = /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)(?::\d+)?[^\s"'`]*/gi;

export function sanitizeSharedText(value: string): string {
  let sanitized = value;
  for (const pattern of TOKEN_PATTERNS) sanitized = sanitized.replace(pattern, '[redacted-secret]');
  for (const pattern of PATH_PATTERNS) sanitized = sanitized.replace(pattern, '[redacted-path]');
  sanitized = sanitized.replace(PRIVATE_URL, '[redacted-private-url]');
  return sanitized;
}

export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[redacted-depth]';
  if (typeof value === 'string') return sanitizeSharedText(value).slice(0, 1_000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAuditMetadata(item, depth + 1));
  if (!value || typeof value !== 'object') return null;
  const safe: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    safe[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : sanitizeAuditMetadata(nested, depth + 1);
  }
  return safe;
}

export function assertSharedProjectionSafe(value: unknown, trail = 'projection'): void {
  if (typeof value === 'string') {
    if (sanitizeSharedText(value) !== value) throw new Error(`Sensitive value escaped at ${trail}.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSharedProjectionSafe(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(key)) throw new Error(`Sensitive key escaped at ${trail}.${key}.`);
    assertSharedProjectionSafe(nested, `${trail}.${key}`);
  }
}
