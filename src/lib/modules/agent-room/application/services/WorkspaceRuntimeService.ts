import {
  inferWslRuntimeFromPath,
  listWslDistributions,
} from '../../infrastructure/WslRuntime.js';

export class WorkspaceRuntimeService {
  async wslAvailability(path?: string | null) {
    const supported = process.platform === 'win32';
    if (!supported) {
      return { supported, distributions: [], inferred: null, error: null };
    }
    try {
      return {
        supported,
        distributions: await listWslDistributions(),
        inferred: path ? inferWslRuntimeFromPath(path) : null,
        error: null,
      };
    } catch (error) {
      return {
        supported,
        distributions: [],
        inferred: path ? inferWslRuntimeFromPath(path) : null,
        error: error instanceof Error ? error.message : 'WSL unavailable.',
      };
    }
  }
}

export const workspaceRuntimeService = new WorkspaceRuntimeService();
