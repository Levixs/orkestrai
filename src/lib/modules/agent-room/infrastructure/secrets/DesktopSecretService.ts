import { randomUUID } from 'node:crypto';

type SecretResponse = {
  type: 'orkestrai:secret:result';
  requestId: string;
  value?: string | null;
  error?: string;
};

type PendingSecret = {
  resolve: (value: string | null) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const state = globalThis as typeof globalThis & {
  __orkestraiSecretPending?: Map<string, PendingSecret>;
  __orkestraiSecretListenerReady?: boolean;
};

const pending = state.__orkestraiSecretPending ??= new Map<string, PendingSecret>();

if (!state.__orkestraiSecretListenerReady && typeof process.on === 'function') {
  process.on('message', (message: unknown) => {
    const response = message as Partial<SecretResponse> | null;
    if (response?.type !== 'orkestrai:secret:result' || !response.requestId) return;
    const request = pending.get(response.requestId);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(response.requestId);
    if (response.error) request.reject(new Error(response.error));
    else request.resolve(response.value ?? null);
  });
  state.__orkestraiSecretListenerReady = true;
}

export class DesktopSecretService {
  async get(key: string): Promise<string | null> {
    if (!/^automation:[a-z0-9:_-]{1,240}$/i.test(key)) throw new Error('Invalid automation secret key.');
    if (typeof process.send !== 'function') {
      if (key.includes(':github:')) return process.env.ORKESTRAI_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? null;
      return null;
    }
    const requestId = randomUUID();
    return new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Secure credential request timed out.'));
      }, 5_000);
      timer.unref?.();
      pending.set(requestId, { resolve, reject, timer });
      process.send?.({ type: 'orkestrai:secret:get', requestId, key });
    });
  }
}

export const desktopSecretService = new DesktopSecretService();
