/**
 * Preload do Electron: expoe uma ponte minima e segura para o renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orkestraiDesktop', {
  /** Abre o seletor nativo de pastas (com opcao de criar nova pasta). */
  pickDirectory: () => ipcRenderer.invoke('orkestrai:pick-directory'),
  platform: process.platform,
});
