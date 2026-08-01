/**
 * Processo principal do Electron — Orkestrai.
 *
 * Sobe o servidor SvelteKit (adapter-node, em build/) como processo filho
 * usando o proprio Electron como runtime Node (ELECTRON_RUN_AS_NODE=1) e
 * abre a janela apontando para ele. Modulos nativos (better-sqlite3,
 * node-pty) precisam estar rebuildados para o ABI do Electron
 * (npm run electron:rebuild).
 */
const { app, BrowserWindow, dialog, ipcMain, Menu, Notification, Tray, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const isDev = !app.isPackaged;
const appRoot = path.resolve(__dirname, '..');

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
 * Carrega variaveis do .env do projeto (o adapter-node nao carrega .env
 * sozinho; em dev o vite faz isso). Nao sobrescreve variaveis ja definidas.
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

/** Em producao, garante um APP_KEY persistente na pasta do usuario. */
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
  throw new Error(`Servidor interno nao respondeu em ${url}`);
}

async function startServer(port) {
  const serverEntry = path.join(appRoot, 'scripts', 'orkestrai-server.mjs');
  const dotEnv = app.isPackaged ? {} : loadDotEnv(path.join(appRoot, '.env'));
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: appRoot,
    env: {
      ...dotEnv,
      ...process.env,
      APP_KEY: process.env.APP_KEY ?? dotEnv.APP_KEY ?? ensureAppKey(),
      ELECTRON_RUN_AS_NODE: '1',
      HOST: '127.0.0.1',
      PORT: String(port),
      // Em Electron, o banco e os dados ficam na pasta do usuario em producao;
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
        showNativeNotification(notifyMatch[1], notifyMatch[2]);
      }
      const attentionMatch = line.match(/\[orkestrai:attention\] (.+)/);
      if (attentionMatch) {
        showNativeNotification('Agente aguardando atencao', attentionMatch[1]);
      }
    }
  });
  serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  serverProcess.on('exit', (code) => {
    console.log(`[server] finalizado com codigo ${code}`);
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
    // processo ja morreu
  }
  serverProcess = null;
}

async function createWindow() {
  // Reaproveita o servidor se ja estiver vivo (janela reaberta apos fechar
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

function showNativeNotification(title, body) {
  if (!Notification.isSupported()) return;
  pendingNotifications += 1;
  updateTrayTitle();
  const notification = new Notification({ title, body: String(body).slice(0, 200) });
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
  tray.setToolTip(pendingNotifications > 0 ? `Orkestrai — ${pendingNotifications} notificacao(oes)` : 'Orkestrai');
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

  app.whenReady().then(() => {
    // Icone do dock em dev (empacotado vem do electron-builder).
    if (process.platform === 'darwin' && !app.isPackaged) {
      app.dock.setIcon(path.join(appRoot, 'electron', 'resources', 'icon.png'));
    }
    createSplash();
    createTray();
    return createWindow();
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
