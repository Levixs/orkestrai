export function isWorkspacePermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /\b(?:EACCES|EPERM)\b|operation not permitted|permission denied/i.test(message);
}
