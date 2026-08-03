/**
 * Helpers compartilhados para parse de saidas JSON-lines das CLIs de agente.
 * Mesma logica que existia em agents.ts (sem mudanca de comportamento).
 */

export function stringifyJsonValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.map(stringifyJsonValue).filter(Boolean);
    return parts.length ? parts.join('\n') : null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['result', 'final', 'content', 'response', 'output', 'text', 'message', 'item', 'delta']) {
      const nested = stringifyJsonValue(record[key]);
      if (nested) return nested;
    }
  }
  return null;
}

export function parseJsonLinesOutput(stdout: string) {
  const events: unknown[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  const text = events
    .map(stringifyJsonValue)
    .filter((value): value is string => Boolean(value))
    .at(-1);

  return {
    content: text ?? stdout.trim(),
    metadata: events.length ? { events } : undefined,
  };
}

export function hasJsonLineError(metadata: Record<string, unknown> | undefined) {
  const events = Array.isArray(metadata?.events) ? metadata.events : [];
  return events.some((event) => event && typeof event === 'object' && (event as Record<string, unknown>).is_error === true);
}
