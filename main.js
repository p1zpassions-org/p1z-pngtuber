const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch { /* not installed: updater disabled */ }
/* data folder is fixed to "P1zTube" (migrates settings from the older folder name once) */
const UD = path.join(app.getPath('appData'), 'P1zTube');
app.setPath('userData', UD);
try {
  if (!fs.existsSync(path.join(UD, 'config.json')))
    for (const old of ['p1z-pngtuber', 'P1z PNGtuber']) {
      const f = path.join(app.getPath('appData'), old, 'config.json');
      if (fs.existsSync(f)) { fs.mkdirSync(UD, { recursive: true }); fs.copyFileSync(f, path.join(UD, 'config.json')); break; }
    }
} catch {}
const ICON = path.join(__dirname, 'build', 'icon.png');
const cfg = () => path.join(app.getPath('userData'), 'config.json');
let win, lang = 'th';
const tr = (th, en) => lang === 'en' ? en : th;
const send = s => { if (win && !win.isDestroyed()) win.webContents.send('upd', s); };
app.setAppUserModelId('com.p1z.p1ztube');
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 960, height: 600, title: 'P1zTube', backgroundColor: '#00FF00', icon: fs.existsSync(ICON) ? ICON : undefined,
    webPreferences: { nodeIntegration: true, contextIsolation: false } });
  win.setMenu(null);
  win.loadFile('index.html');
  win.on('focus', () => win.webContents.send('focus', true));
  win.on('blur', () => win.webContents.send('focus', false));
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
ipcMain.on('load', e => { try { e.returnValue = fs.readFileSync(cfg(), 'utf8'); } catch { e.returnValue = null; } });
ipcMain.on('save', (e, s) => { try { fs.writeFileSync(cfg(), s); } catch {} });
ipcMain.on('lang', (e, l) => { lang = l === 'en' ? 'en' : 'th'; });
ipcMain.handle('ver', () => app.getVersion());
ipcMain.handle('pick', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Images', extensions: ['png', 'gif', 'webp', 'jpg', 'jpeg'] }] });
  if (r.canceled) return null;
  const d = path.join(app.getPath('userData'), 'images');
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, Date.now() + path.extname(r.filePaths[0]));
  fs.copyFileSync(r.filePaths[0], f);
  return pathToFileURL(f).href;
});
ipcMain.on('hotkeys', (e, map) => {
  globalShortcut.unregisterAll();
  for (const [act, list] of Object.entries(map))
    for (const a of list) { try { globalShortcut.register(a, () => win.webContents.send('hotkey', act)); } catch {} }
});

/* ---------- auto update (GitHub Releases) ---------- */
const flash = () => { if (win && !win.isDestroyed()) win.flashFrame(true); };
if (autoUpdater) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => send({ state: 'none' }));
  autoUpdater.on('update-available', info => { send({ state: 'available', version: info.version, current: app.getVersion(), ask: 'download' }); flash(); });
  autoUpdater.on('download-progress', p => { send({ state: 'downloading', percent: Math.round(p.percent) }); if (win && !win.isDestroyed()) win.setProgressBar(p.percent / 100); });
  autoUpdater.on('update-downloaded', info => { if (win && !win.isDestroyed()) win.setProgressBar(-1); send({ state: 'ready', version: info.version, ask: 'install' }); flash(); });
  autoUpdater.on('error', e => { if (win && !win.isDestroyed()) win.setProgressBar(-1); send({ state: 'error', message: String((e && e.message) || e).slice(0, 160) }); });
}
ipcMain.on('upd-answer', (e, kind, ok) => {
  if (!autoUpdater || !ok) return;
  if (kind === 'download') { send({ state: 'downloading', percent: 0 }); autoUpdater.downloadUpdate().catch(() => {}); }
  else if (kind === 'install') autoUpdater.quitAndInstall();
});
ipcMain.on('upd-check', (e, manual) => {
  if (!autoUpdater || !app.isPackaged) { if (manual) send({ state: 'dev' }); return; }
  autoUpdater.checkForUpdates().catch(() => {});
});
