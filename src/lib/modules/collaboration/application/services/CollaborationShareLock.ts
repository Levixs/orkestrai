const shareLocks = new Map<string, Promise<unknown>>();

export async function withCollaborationShareLock<T>(shareId: string, callback: () => Promise<T>): Promise<T> {
  const previous = shareLocks.get(shareId) ?? Promise.resolve();
  const execution = previous.catch(() => undefined).then(callback);
  shareLocks.set(shareId, execution);
  try {
    return await execution;
  } finally {
    if (shareLocks.get(shareId) === execution) shareLocks.delete(shareId);
  }
}
