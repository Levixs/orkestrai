import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/**
 * Shim da CLI `orkestrai` no PATH dos terminais: os agentes invocam
 * `orkestrai ...` na shell, entao o binario precisa existir fora do repo/app
 * (o pacote empacotado nao instala nada globalmente). Regravado a cada boot
 * (dev pelo vite.config, empacotado pelo orkestrai-server.mjs).
 * Exporta ORKESTRAI_SHIM_DIR para o PtySessionManager incluir no PATH do PTY.
 */
export function installOrkestraiShim() {
  try {
    const cliEntry = resolve('packages/orkestrai-cli/bin/orkestrai.js');
    if (!existsSync(cliEntry)) return null;
    const runtime = process.execPath;
    const electronRuntime = Boolean(process.versions.electron);
    const shimDir = process.env.ORKESTRAI_DATA_DIR
      ? resolve(process.env.ORKESTRAI_DATA_DIR, 'bin')
      : resolve('storage', 'bin');
    mkdirSync(shimDir, { recursive: true });
    const posixShim = resolve(shimDir, 'orkestrai');
    const shellQuote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`;
    const electronEnv = electronRuntime ? 'ELECTRON_RUN_AS_NODE=1 ' : '';
    writeFileSync(posixShim, `#!/bin/sh\n${electronEnv}exec ${shellQuote(runtime)} ${shellQuote(cliEntry)} "$@"\n`);
    chmodSync(posixShim, 0o755);
    writeFileSync(
      resolve(shimDir, 'orkestrai.cmd'),
      `@echo off\r\n${electronRuntime ? 'set "ELECTRON_RUN_AS_NODE=1"\r\n' : ''}"${runtime}" "${cliEntry}" %*\r\n`
    );
    process.env.ORKESTRAI_SHIM_DIR = shimDir;
    process.env.ORKESTRAI_CLI = cliEntry;
    process.env.ORKESTRAI_CLI_RUNTIME = runtime;
    process.env.ORKESTRAI_CLI_RUNTIME_IS_ELECTRON = electronRuntime ? '1' : '0';
    return shimDir;
  } catch (error) {
    console.warn('[orkestrai] falha ao instalar o shim da CLI:', error?.message ?? error);
    return null;
  }
}

/**
 * Anuncia a URL atual da API em ~/.orkestrai/runtime.json: a porta do app
 * empacotado e LIVRE (muda a cada execucao), entao o apiUrl gravado no
 * workspace.json pode ficar obsoleto — a CLI le este arquivo primeiro.
 */
export function writeOrkestraiRuntimeFile(apiUrl) {
  try {
    const dir = resolve(homedir(), '.orkestrai');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'runtime.json'), JSON.stringify({ apiUrl, updatedAt: new Date().toISOString() }, null, 2));
  } catch (error) {
    console.warn('[orkestrai] falha ao gravar runtime.json:', error?.message ?? error);
  }
}
