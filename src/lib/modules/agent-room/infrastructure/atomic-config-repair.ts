import { constants } from 'node:fs';
import { copyFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

type RepairResult = { content: string; repaired: boolean };

const globalRepairState = globalThis as typeof globalThis & {
  __orkestraiConfigRepairQueue?: Promise<unknown>;
};

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function acquireLock(path: string): Promise<() => Promise<void>> {
  const lockPath = `${path}.orkestrai-lock`;
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      try {
        await handle.writeFile(`${process.pid}\n`);
      } finally {
        await handle.close();
      }
      return async () => { await rm(lockPath, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const details = await stat(lockPath).catch(() => null);
      if (details && Date.now() - details.mtimeMs > 30_000) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`Timed out waiting to repair ${path}`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
  }
}

async function performRepair(path: string, repair: (current: string) => RepairResult): Promise<boolean> {
  const current = await readOptional(path);
  if (current === null) return false;
  const result = repair(current);
  if (!result.repaired || result.content === current) return false;

  await mkdir(dirname(path), { recursive: true });
  const releaseLock = await acquireLock(path);
  const tempPath = `${path}.orkestrai-${process.pid}-${Date.now()}.tmp`;
  try {
    const lockedCurrent = await readFile(path, 'utf8');
    const lockedResult = repair(lockedCurrent);
    if (!lockedResult.repaired || lockedResult.content === lockedCurrent) return false;
    const details = await stat(path);
    const handle = await open(tempPath, 'wx', details.mode & 0o777);
    try {
      await handle.writeFile(lockedResult.content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await copyFile(path, `${path}.before-orkestrai-repair`, constants.COPYFILE_EXCL).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    await rename(tempPath, path);
    return true;
  } finally {
    await rm(tempPath, { force: true });
    await releaseLock();
  }
}

/** Serializes repairs across bundled module copies and replaces the file atomically. */
export function repairConfigFileAtomically(
  path: string,
  repair: (current: string) => RepairResult,
): Promise<boolean> {
  const previous = globalRepairState.__orkestraiConfigRepairQueue ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => performRepair(path, repair));
  globalRepairState.__orkestraiConfigRepairQueue = next;
  return next;
}
