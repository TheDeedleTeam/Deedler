const { app, BrowserWindow, Menu, MenuItem, ipcMain, session, shell, clipboard, dialog, webContents } = require('electron');
const path = require('path');
const fs = require('fs');

// ───────────────────────── Instância única ─────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let adblockEnabled = true;
let blockedCount = 0;
const downloadedPaths = new Set();

const send = (channel, data) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
};

// ───────────────────────── Bloqueador de anúncios / rastreadores ─────────────────────────
const BLOCKED_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  'google-analytics.com', 'taboola.com', 'outbrain.com', 'adnxs.com', 'scorecardresearch.com',
  'hotjar.com', 'criteo.com', 'criteo.net', 'pubmatic.com', 'rubiconproject.com',
  'amazon-adsystem.com', 'ads-twitter.com', 'moatads.com', 'adsrvr.org', 'quantserve.com',
  'popads.net', 'propellerads.com', 'exoclick.com', 'adform.net', 'openx.net', 'casalemedia.com'
];

function isBlockedHost(host) {
  return BLOCKED_HOSTS.some((b) => host === b || host.endsWith('.' + b));
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_eid$|igshid$|ref_src$|yclid$|msclkid$|_hsenc$|_hsmi$)/i;
function cleanUrl(raw) {
  try {
    const u = new URL(raw);
    [...u.searchParams.keys()].forEach((k) => {
      if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    });
    return u.toString();
  } catch {
    return raw;
  }
}

// ───────────────────────── Estado da janela ─────────────────────────
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return {};
  }
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {}
}

// ───────────────────────── Atalhos de teclado ─────────────────────────
function shortcutFor(input) {
  const mod = input.control || input.meta;
  const k = (input.key || '').toLowerCase();

  if (input.alt && !mod) {
    if (k === 'arrowleft') return 'back';
    if (k === 'arrowright') return 'forward';
    if (k === 'home') return 'home';
    return null;
  }
  if (k === 'f12') return 'devtools';
  if (k === 'f5') return mod ? 'hard-reload' : 'reload';
  if (k === 'f11') return 'fullscreen';
  if (k === 'escape') return 'escape';
  if (!mod) return null;

  if (k === 'tab') return input.shift ? 'prev-tab' : 'next-tab';
  if (k === '=' || k === '+') return 'zoom-in';
  if (k === '-' || k === '_') return 'zoom-out';
  if (k === '0') return 'zoom-reset';
  if (/^[1-9]$/.test(k) && !input.shift) return 'goto-tab:' + k;

  if (input.shift) {
    const shiftMap = { t: 'reopen-tab', i: 'devtools', s: 'screenshot', d: 'dark-mode', p: 'palette', r: 'hard-reload' };
    return shiftMap[k] || null;
  }
  const map = { t: 'new-tab', w: 'close-tab', l: 'focus-url', r: 'reload', d: 'bookmark', f: 'find', h: 'history', j: 'downloads', b: 'bookmarks' };
  return map[k] || null;
}

function handleShortcut(event, input) {
  if (input.type !== 'keyDown') return;
  const action = shortcutFor(input);
  if (!action) return;
  if (action === 'fullscreen') {
    event.preventDefault();
    if (win) win.setFullScreen(!win.isFullScreen());
    return;
  }
  // Escape não pode ser bloqueado, senão quebra páginas (fechar modais etc.)
  if (action !== 'escape') event.preventDefault();
  send('shortcut', action);
}

// ───────────────────────── Compatibilidade de navegação ─────────────────────────
const nav = {
  canBack: (c) => (c.navigationHistory ? c.navigationHistory.canGoBack() : c.canGoBack()),
  canForward: (c) => (c.navigationHistory ? c.navigationHistory.canGoForward() : c.canGoForward()),
  back: (c) => (c.navigationHistory ? c.navigationHistory.goBack() : c.goBack()),
  forward: (c) => (c.navigationHistory ? c.navigationHistory.goForward() : c.goForward())
};

// ───────────────────────── Menu de contexto das páginas ─────────────────────────
function buildContextMenu(contents, params) {
  const m = new Menu();
  const add = (label, click, enabled = true) => m.append(new MenuItem({ label, click, enabled }));
  const role = (label, r, enabled = true) => m.append(new MenuItem({ label, role: r, enabled }));
  const sep = () => m.append(new MenuItem({ type: 'separator' }));

  if (params.linkURL) {
    add('Abrir link em nova aba', () => send('open-in-new-tab', params.linkURL));
    add('Copiar endereço do link', () => clipboard.writeText(params.linkURL));
    add('Copiar link limpo (sem rastreadores)', () => clipboard.writeText(cleanUrl(params.linkURL)));
    add('Salvar link como…', () => contents.downloadURL(params.linkURL));
    sep();
  }

  if (params.mediaType === 'image' && params.srcURL) {
    add('Abrir imagem em nova aba', () => send('open-in-new-tab', params.srcURL));
    add('Salvar imagem como…', () => contents.downloadURL(params.srcURL));
    add('Copiar imagem', () => contents.copyImageAt(params.x, params.y));
    add('Copiar endereço da imagem', () => clipboard.writeText(params.srcURL));
    sep();
  }

  if ((params.mediaType === 'video' || params.mediaType === 'audio') && params.srcURL && !params.srcURL.startsWith('blob:')) {
    add('Salvar mídia como…', () => contents.downloadURL(params.srcURL));
    add('Copiar endereço da mídia', () => clipboard.writeText(params.srcURL));
    sep();
  }

  if (params.isEditable) {
    role('Desfazer', 'undo', params.editFlags.canUndo);
    role('Refazer', 'redo', params.editFlags.canRedo);
    sep();
    role('Recortar', 'cut', params.editFlags.canCut);
    role('Copiar', 'copy', params.editFlags.canCopy);
    role('Colar', 'paste', params.editFlags.canPaste);
    role('Selecionar tudo', 'selectAll');
    sep();
  } else if (params.selectionText && params.selectionText.trim()) {
    role('Copiar', 'copy');
    const short = params.selectionText.trim().slice(0, 36);
    add(`Pesquisar "${short}${params.selectionText.trim().length > 36 ? '…' : ''}"`, () => send('open-in-new-tab', params.selectionText.trim()));
    sep();
  }

  add('Voltar', () => nav.back(contents), nav.canBack(contents));
  add('Avançar', () => nav.forward(contents), nav.canForward(contents));
  add('Recarregar', () => contents.reload());
  sep();
  add('Copiar endereço da página', () => clipboard.writeText(contents.getURL()));
  add('Copiar endereço limpo da página', () => clipboard.writeText(cleanUrl(contents.getURL())));
  add('Imprimir…', () => contents.print());
  add('Ver código-fonte', () => send('open-in-new-tab', 'view-source:' + contents.getURL()));
  sep();
  add('Inspecionar elemento', () => contents.inspectElement(params.x, params.y));
  return m;
}

// ───────────────────────── Sessão: UA, adblock, permissões, downloads ─────────────────────────
const PROMPTED_PERMISSIONS = {
  media: 'a sua câmera/microfone',
  geolocation: 'a sua localização',
  notifications: 'enviar notificações'
};
const AUTO_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
const permissionCache = new Map();
const RISKY_EXT = /\.(exe|bat|cmd|msi|scr|ps1|sh|com|jar|vbs|lnk|app|dmg|pkg|deb|appimage)$/i;

function setupSession() {
  const ses = session.defaultSession;

  // Remove "Electron/x" e o nome do app do User-Agent (vários sites barram navegadores "estranhos")
  const ua = ses.getUserAgent()
    .split(' ')
    .filter((p) => !p.startsWith('Electron/') && !p.startsWith(app.getName() + '/'))
    .join(' ');
  ses.setUserAgent(ua);

  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (adblockEnabled && details.resourceType !== 'mainFrame') {
      try {
        if (isBlockedHost(new URL(details.url).hostname)) {
          blockedCount++;
          return callback({ cancel: true });
        }
      } catch {}
    }
    callback({});
  });

  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (AUTO_ALLOW.has(permission)) return callback(true);
    const label = PROMPTED_PERMISSIONS[permission];
    if (!label) return callback(false);

    let origin = '';
    try { origin = new URL(details.requestingUrl).origin; } catch {}
    const key = origin + '|' + permission;
    if (permissionCache.has(key)) return callback(permissionCache.get(key));

    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Permitir', 'Bloquear'],
        defaultId: 1,
        cancelId: 1,
        title: 'Permissão do site',
        message: `${origin || 'Este site'} quer acessar ${label}.`,
        detail: 'Sua escolha vale até fechar o Deedler.'
      });
      const ok = response === 0;
      permissionCache.set(key, ok);
      callback(ok);
    } catch {
      callback(false);
    }
  });

  let dlId = 0;
  ses.on('will-download', (event, item) => {
    const id = ++dlId;
    const fileName = item.getFilename();
    send('download-started', { id, fileName, totalBytes: item.getTotalBytes() });

    item.on('updated', (e, state) => {
      const total = item.getTotalBytes();
      const received = item.getReceivedBytes();
      send('download-progress', {
        id, fileName, received, total,
        progress: total > 0 ? Math.round((received / total) * 100) : 0,
        state: state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'
      });
    });

    item.once('done', (e, state) => {
      const savePath = item.getSavePath();
      if (state === 'completed' && savePath) downloadedPaths.add(savePath);
      send('download-completed', { id, fileName, state, path: savePath });
    });
  });
}

// ───────────────────────── Janela ─────────────────────────
function createWindow() {
  const saved = loadWindowState();

  win = new BrowserWindow({
    width: saved.width || 1280,
    height: saved.height || 830,
    x: saved.x,
    y: saved.y,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#121214',
    title: 'Deedler',
    frame: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (saved.maximized) win.maximize();
  win.loadFile('index.html');

  // Segurança dos <webview>: nada de preload/node vindo de fora
  win.webContents.on('will-attach-webview', (e, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });

  // Arrastar um arquivo para a janela não pode "navegar" a interface inteira
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', handleShortcut);

  win.on('close', saveWindowState);
  win.on('closed', () => { win = null; });
}

app.on('web-contents-created', (event, contents) => {
  if (contents.getType() !== 'webview') return;

  // window.open / target=_blank viram abas, em vez de janelas soltas
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) send('open-in-new-tab', url);
    return { action: 'deny' };
  });

  contents.on('before-input-event', handleShortcut);
  contents.on('context-menu', (e, params) => buildContextMenu(contents, params).popup());
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// ───────────────────────── IPC ─────────────────────────
ipcMain.handle('show-in-folder', (e, p) => {
  if (typeof p === 'string' && downloadedPaths.has(p)) shell.showItemInFolder(p);
});

ipcMain.handle('open-path', async (e, p) => {
  if (typeof p !== 'string' || !downloadedPaths.has(p)) return 'bloqueado';
  if (RISKY_EXT.test(p)) {
    shell.showItemInFolder(p); // executáveis nunca abrem direto
    return 'executavel';
  }
  return shell.openPath(p);
});

ipcMain.handle('set-adblock', (e, v) => { adblockEnabled = !!v; return adblockEnabled; });
ipcMain.handle('copy-text', (e, t) => { clipboard.writeText(String(t)); });

ipcMain.handle('clear-data', async () => {
  const ses = session.defaultSession;
  await ses.clearStorageData();
  await ses.clearCache();
  permissionCache.clear();
  return true;
});

ipcMain.handle('capture-page', async (e, id) => {
  const wc = webContents.fromId(id);
  if (!wc || wc.getType() !== 'webview') return null;
  const img = await wc.capturePage();
  clipboard.writeImage(img);
  const file = path.join(app.getPath('downloads'), `deedler-captura-${Date.now()}.png`);
  fs.writeFileSync(file, img.toPNG());
  downloadedPaths.add(file);
  return file;
});

ipcMain.handle('toggle-devtools', (e, id) => {
  const wc = webContents.fromId(id);
  if (!wc || wc.getType() !== 'webview') return;
  if (wc.isDevToolsOpened()) wc.closeDevTools();
  else wc.openDevTools({ mode: 'detach' });
});

ipcMain.handle('app-info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  blocked: blockedCount
}));

// ───────────────────────── Boot ─────────────────────────
app.whenReady().then(() => {
  // Sem menu padrão: Ctrl+R/Ctrl+W do menu do Electron recarregavam/fechavam a própria interface
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null
  );
  setupSession();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });