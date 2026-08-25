const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_BACKUPS = 2;
const MAX_ENTRY_LENGTH = 24 * 1024;

function redactDiagnosticText(value) {
  return String(value)
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[REDACTED]@')
    .replace(/([?&](?:code|state|session|id[_-]?token)=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g, '[REDACTED]')
    .replace(
      /((?:authorization|cookie|set-cookie|password|passwd|secret|access[_-]?token|refresh[_-]?token|api[_-]?key|app[_-]?key)\s*["']?\s*[:=]\s*["']?)[^"',;\s}\]]+/gi,
      '$1[REDACTED]'
    );
}

function formatDiagnosticValues(values) {
  const formatted = util.formatWithOptions(
    { colors: false, depth: 5, maxArrayLength: 50, maxStringLength: 8_000, breakLength: Infinity },
    ...values
  );
  const sanitized = redactDiagnosticText(formatted)
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r?\n/g, '\\n');
  if (sanitized.length <= MAX_ENTRY_LENGTH) return sanitized;
  const tailLength = 4 * 1024;
  return `${sanitized.slice(0, MAX_ENTRY_LENGTH - tailLength)}...[truncated]...${sanitized.slice(-tailLength)}`;
}

function rotateLogs(filePath, backups) {
  for (let index = backups; index >= 1; index -= 1) {
    const destination = `${filePath}.${index}`;
    const source = index === 1 ? filePath : `${filePath}.${index - 1}`;
    if (!fs.existsSync(source)) continue;
    fs.rmSync(destination, { force: true });
    fs.renameSync(source, destination);
  }
}

function createDiagnosticsLogger(logDirectory, options = {}) {
  const maxBytes = Math.max(1_024, Number(options.maxBytes) || DEFAULT_MAX_BYTES);
  const backups = Math.max(1, Math.min(5, Number(options.backups) || DEFAULT_BACKUPS));
  fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  const filePath = path.join(logDirectory, 'orkestrai.log');

  function write(level, scope, ...values) {
    try {
      const line = `${new Date().toISOString()} [${String(level).toUpperCase()}] [${scope}] ${formatDiagnosticValues(values)}\n`;
      let currentSize = 0;
      try {
        currentSize = fs.statSync(filePath).size;
      } catch {
        currentSize = 0;
      }
      if (currentSize > 0 && currentSize + Buffer.byteLength(line) > maxBytes) rotateLogs(filePath, backups);
      fs.appendFileSync(filePath, line, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Diagnostics must never interrupt the desktop app.
    }
  }

  return { directory: logDirectory, filePath, write };
}

module.exports = { createDiagnosticsLogger, formatDiagnosticValues, redactDiagnosticText };
