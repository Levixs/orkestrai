/**
 * Processo principal do Electron — Orkestrai.
 *
 * Sobe o servidor SvelteKit (adapter-node, em build/) como processo filho
 * usando o proprio Electron como runtime Node (ELECTRON_RUN_AS_NODE=1) e
 * abre a janela apontando para ele. Modulos nativos (better-sqlite3,
 * node-pty) precisam estar rebuildados para o ABI do Electron
 * (npm run electron:rebuild).
 */
const { app, BrowserWindow, dialog, ipcMain, Menu, Notification, Tray, nativeImage, session, shell } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { canInstallUpdatesAutomatically, isNewerVersion } = require('./update-policy.cjs');

const isDev = !app.isPackaged;
const appRoot = path.resolve(__dirname, '..');
// Processos filhos (ELECTRON_RUN_AS_NODE) não leem dentro do asar: o servidor
// roda a partir dos arquivos unpacked quando empacotado.
const runtimeRoot = app.isPackaged ? appRoot.replace('app.asar', 'app.asar.unpacked') : appRoot;

let serverProcess = null;
let mainWindow = null;
let splashWindow = null;
let serverPort = null;
let tray = null;
let pendingNotifications = 0;

/** Splash animada com o logo enquanto o servidor sobe. */
function createSplash() {
  if (splashWindow) return;
  splashWindow = new BrowserWindow({
    width: 420,
    height: 340,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#0D0B2E',
    webPreferences: { contextIsolation: true },
  });
  splashWindow.center();
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow?.show());
}

function closeSplash() {
  if (!splashWindow) return;
  splashWindow.close();
  splashWindow = null;
}

/**
 * Carrega variaveis do .env do projeto (o adapter-node não carrega .env
 * sozinho; em dev o vite faz isso). Não sobrescreve variaveis já definidas.
 */
function loadDotEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

/** Em producao, garante um APP_KEY persistente na pasta do usuário. */
function ensureAppKey() {
  if (process.env.APP_KEY) return process.env.APP_KEY;
  const keyFile = path.join(app.getPath('userData'), '.app-key');
  if (fs.existsSync(keyFile)) return fs.readFileSync(keyFile, 'utf8').trim();
  const generated = `base64:${crypto.randomBytes(32).toString('base64')}`;
  fs.writeFileSync(keyFile, generated, { mode: 0o600 });
  return generated;
}

function findFreePort(start = 4173, attempts = 20) {
  return new Promise((resolvePort, reject) => {
    let candidate = start;
    const tryPort = () => {
      if (candidate >= start + attempts) {
        reject(new Error('Nenhuma porta livre encontrada para o servidor interno.'));
        return;
      }
      const tester = net
        .createServer()
        .once('error', () => {
          candidate += 1;
          tryPort();
        })
        .once('listening', () => {
          tester.close(() => resolvePort(candidate));
        })
        .listen(candidate, '127.0.0.1');
    };
    tryPort();
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok || response.status === 404) return;
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Servidor interno não respondeu em ${url}`);
}

/** Extrai o node-pty para o userData (macOS 15+ mata o spawn-helper dentro do bundle). */
function ensureNativePty(userDataDir) {
  if (!app.isPackaged) return null;
  const src = path.join(runtimeRoot, 'node_modules', 'node-pty');
  const dest = path.join(userDataDir, 'native', 'node-pty');
  try {
    const srcVersion = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version;
    const destPkg = path.join(dest, 'package.json');
    const destVersion = fs.existsSync(destPkg) ? JSON.parse(fs.readFileSync(destPkg, 'utf8')).version : null;
    if (srcVersion !== destVersion) {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(src, dest, { recursive: true });
    }
    return dest;
  } catch (error) {
    console.warn('[orkestrai] falha ao extrair node-pty para userData:', error?.message ?? error);
    return null;
  }
}

async function startServer(port) {
  const serverEntry = path.join(runtimeRoot, 'scripts', 'orkestrai-server.mjs');
  const dotEnv = app.isPackaged ? {} : loadDotEnv(path.join(appRoot, '.env'));
  const ptyModuleDir = ensureNativePty(app.getPath('userData'));
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: runtimeRoot,
    env: {
      ...dotEnv,
      ...process.env,
      APP_KEY: process.env.APP_KEY ?? dotEnv.APP_KEY ?? ensureAppKey(),
      ELECTRON_RUN_AS_NODE: '1',
      HOST: '127.0.0.1',
      PORT: String(port),
      // A porta e livre (muda a cada execução): configs da ponte gravados em
      // workspaces precisam da URL atual (ver também ~/.orkestrai/runtime.json).
      ORKESTRAI_API_URL: `http://127.0.0.1:${port}`,
      ...(ptyModuleDir ? { ORKESTRAI_PTY_MODULE: ptyModuleDir } : {}),
      // Em Electron, o banco e os dados ficam na pasta do usuário em producao;
      // em dev, usa a pasta do projeto como sempre.
      ...(app.isPackaged ? { ORKESTRAI_DATA_DIR: app.getPath('userData') } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => {
    const text = String(chunk);
    process.stdout.write(`[server] ${text}`);
    for (const line of text.split(/\r?\n/)) {
      const notifyMatch = line.match(/\[orkestrai:notify\] \[(.+?)\] (.+)/);
      if (notifyMatch) {
        showNativeNotification(`Orkestrai — ${notifyMatch[1]}`, notifyMatch[2]);
      }
    }
  });
  serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  serverProcess.on('exit', (code) => {
    console.log(`[server] finalizado com código ${code}`);
    serverProcess = null;
  });

  await waitForServer(`http://127.0.0.1:${port}/`);
  return port;
}

function stopServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill('SIGTERM');
  } catch {
    // processo já morreu
  }
  serverProcess = null;
}

async function createWindow() {
  // Reaproveita o servidor se já estiver vivo (janela reaberta após fechar
  // no macOS mantem o app rodando sem janela).
  if (!serverProcess || serverPort === null) {
    serverPort = await findFreePort();
    await startServer(serverPort);
  }
  const port = serverPort;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Orkestrai',
    icon: path.join(appRoot, 'electron', 'resources', 'icon.png'),
    backgroundColor: '#0D0B2E',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow?.show();
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

ipcMain.handle('orkestrai:pick-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolher pasta do workspace',
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

// -- Auto-update (electron-updater, releases publicos no GitHub) --------------
// O download cai num cache separado e só e ativado na troca (quitAndInstall):
// a versão atual NUNCA e tocada antes da nova estar 100% baixada e verificada
// (sha512 do latest-mac.yml). Dados do usuário ficam fora do bundle.

let autoUpdater = null;
if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (error) {
    autoUpdater = null;
    console.error('[orkestrai] updater indisponivel no pacote:', error?.message ?? error);
  }
}

let latestUpdateState = { status: 'idle' };
let updateCheckPromise = null;
let automaticUpdateInstallSupported = process.platform !== 'darwin';
const MAC_LATEST_RELEASE_API = 'https://api.github.com/repos/beeblock/orkestrai/releases/latest';

function sendUpdate(payload) {
  latestUpdateState = payload;
  mainWindow?.webContents.send('orkestrai:update', payload);
}

function updateErrorPayload(error) {
  const message = String(error?.message ?? error).slice(0, 300);
  const updateInProgress = latestUpdateState.status === 'available' || latestUpdateState.status === 'downloading';
  return { status: updateInProgress ? 'error' : 'check-error', message };
}

async function checkManualMacUpdate() {
  const response = await fetch(MAC_LATEST_RELEASE_API, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'Orkestrai updater' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub releases respondeu HTTP ${response.status}.`);
  const release = await response.json();
  const version = String(release?.tag_name ?? '').replace(/^v/, '');
  return isNewerVersion(version, app.getVersion()) ? { status: 'manual', version } : { status: 'none' };
}

async function checkForUpdates() {
  if (!autoUpdater) {
    return app.isPackaged
      ? { status: 'check-error', message: 'O módulo de atualização não está disponível neste pacote.' }
      : { status: 'unsupported' };
  }
  if (updateCheckPromise) return updateCheckPromise;

  updateCheckPromise = (async () => {
    try {
      if (process.platform === 'darwin' && !automaticUpdateInstallSupported) {
        sendUpdate({ status: 'checking' });
        const payload = await checkManualMacUpdate();
        sendUpdate(payload);
        return payload;
      }
      const result = await autoUpdater.checkForUpdates();
      if (result?.isUpdateAvailable) {
        return {
          status: automaticUpdateInstallSupported ? 'available' : 'manual',
          version: result.updateInfo.version,
        };
      }
      return { status: 'none' };
    } catch (error) {
      const payload = updateErrorPayload(error);
      if (latestUpdateState.status !== payload.status) sendUpdate(payload);
      return payload;
    } finally {
      updateCheckPromise = null;
    }
  })();

  return updateCheckPromise;
}

function setupAutoUpdater() {
  if (!autoUpdater) return;
  automaticUpdateInstallSupported = canInstallUpdatesAutomatically();
  autoUpdater.autoDownload = automaticUpdateInstallSupported;
  autoUpdater.autoInstallOnAppQuit = automaticUpdateInstallSupported;
  autoUpdater.allowPrerelease = false;
  if (!automaticUpdateInstallSupported) {
    void checkForUpdates();
    setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000).unref();
    return;
  }
  autoUpdater.on('checking-for-update', () => sendUpdate({ status: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    sendUpdate({ status: automaticUpdateInstallSupported ? 'available' : 'manual', version: info.version })
  );
  autoUpdater.on('update-not-available', () => sendUpdate({ status: 'none' }));
  autoUpdater.on('download-progress', (progress) => sendUpdate({ status: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdate({ status: 'downloaded', version: info.version }));
  autoUpdater.on('error', (error) => sendUpdate(updateErrorPayload(error)));
  void checkForUpdates();
  // Re-checa a cada 6h com o app aberto.
  setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000).unref();
}

ipcMain.handle('orkestrai:update-check', async () => {
  return checkForUpdates();
});

ipcMain.handle('orkestrai:update-state', () => latestUpdateState);

ipcMain.handle('orkestrai:update-install', () => {
  if (automaticUpdateInstallSupported) autoUpdater?.quitAndInstall();
});

ipcMain.handle('orkestrai:app-version', () => app.getVersion());

ipcMain.handle('orkestrai:open-external', (_event, url) => {
  // Só https — nunca abre esquema arbitrario vindo do renderer.
  if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
});

function showNativeNotification(title, body) {
  if (!Notification.isSupported()) return;
  pendingNotifications += 1;
  updateTrayTitle();
  const notification = new Notification({
    title,
    body: String(body).slice(0, 200),
    // Ícone da marca no toast (Win/macOS) em vez do generico do sistema.
    icon: nativeImage.createFromPath(path.join(appRoot, 'electron', 'resources', 'icon.png')),
    silent: false,
  });
  notification.on('click', () => {
    pendingNotifications = 0;
    updateTrayTitle();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  notification.show();
}

function updateTrayTitle() {
  if (!tray) return;
  tray.setToolTip(pendingNotifications > 0 ? `Orkestrai — ${pendingNotifications} notificação(oes)` : 'Orkestrai');
}

function createTray() {
  if (tray) return;
  // macOS: imagem template (o sistema tinja claro/escuro). Win/Linux: colorida.
  const resourcesDir = path.join(appRoot, 'electron', 'resources');
  const trayFile = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const image = nativeImage.createFromPath(path.join(resourcesDir, trayFile));
  if (process.platform === 'darwin') image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Orkestrai');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir Orkestrai',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow().catch((error) => console.error(error));
        }
      },
    },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      createWindow().catch((error) => console.error(error));
    }
  });

  app.whenReady().then(async () => {
    // Ícone do dock em dev (empacotado vem do electron-builder).
    if (process.platform === 'darwin' && !app.isPackaged) {
      app.dock.setIcon(path.join(appRoot, 'electron', 'resources', 'icon.png'));
    }
    // Ditado por voz: permite microfone só para o proprio app (localhost).
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents?.getURL?.() ?? '';
      const own = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1') || url.startsWith('file://');
      callback(own && permission === 'media');
    });
    createSplash();
    createTray();
    await createWindow();
    setupAutoUpdater();
  }).catch((error) => {
    console.error('Falha ao iniciar o Orkestrai:', error);
    closeSplash();
    app.exit(1);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => console.error(error));
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', stopServer);
  app.on('quit', () => {
    closeSplash();
    stopServer();
  });
}

if (isDev) {
  process.on('SIGINT', () => {
    stopServer();
    process.exit(0);
  });
}
