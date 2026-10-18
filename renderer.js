'use strict';

/* ═══════════════════════════ Utilidades ═══════════════════════════ */
const HOME = 'deedler://home';
const $ = (id) => document.getElementById(id);
const api = window.deedlerAPI || {};
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  kids.flat().forEach((c) => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return n;
}

const store = {
  get(k, d) {
    try { const v = localStorage.getItem('deedler.' + k); return v ? JSON.parse(v) : d; } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem('deedler.' + k, JSON.stringify(v)); } catch {} }
};

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const hostOf = (u) => safe(() => new URL(u).hostname, '');
const normUrl = (u) => (u || '').replace(/\/$/, '');

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 42%)`;
}

function avatar(label, size = 14) {
  const letter = (label || '?').replace(/^www\./, '').charAt(0).toUpperCase();
  return el('span', { className: 'bm-avatar', text: letter, style: { background: hashColor(label || '?'), width: size + 'px', height: size + 'px' } });
}

function fmtBytes(n) {
  if (!n || n < 0) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '255,149,0';
}

function toast(msg) {
  const t = el('div', { className: 'toast', text: msg });
  $('toasts').append(t);
  setTimeout(() => t.remove(), 2600);
}

/* ═══════════════════════════ Configurações ═══════════════════════════ */
const ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' }
};

// Atalhos de busca: "yt lofi", "gh kristal", "w deltarune"…
const BANGS = {
  yt: 'https://www.youtube.com/results?search_query=',
  gh: 'https://github.com/search?q=',
  w: 'https://pt.wikipedia.org/w/index.php?search=',
  mdn: 'https://developer.mozilla.org/search?q=',
  npm: 'https://www.npmjs.com/search?q=',
  so: 'https://stackoverflow.com/search?q=',
  tr: 'https://translate.google.com/?sl=auto&tl=pt&text='
};

const DEFAULT_SETTINGS = { engine: 'google', accent: '#ff9500', adblock: true, restore: true, bookmarksBar: true };
const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));

function applySettings() {
  document.documentElement.style.setProperty('--accent', settings.accent);
  document.documentElement.style.setProperty('--accent-rgb', hexToRgb(settings.accent));
  $('bookmarks-bar').classList.toggle('visible', !!settings.bookmarksBar && bookmarks.length > 0);
  $('url-bar').placeholder = `Pesquisar com ${ENGINES[settings.engine].name} ou digitar URL…`;
  api.setAdblock?.(settings.adblock);
  store.set('settings', settings);
}

/* ═══════════════════════════ Dados persistentes ═══════════════════════════ */
let bookmarks = store.get('bookmarks', []);
let history = store.get('history', []);
const closedTabs = [];
const zoomByHost = store.get('zoom', {});
const downloadLog = [];

const saveHistory = debounce(() => store.set('history', history.slice(0, 1000)), 500);

function addHistory(title, url) {
  if (!/^https?:/i.test(url)) return;
  const last = history[0];
  if (last && last.url === url && Date.now() - last.time < 3000) return;
  history.unshift({ title: title || url, url, time: Date.now() });
  if (history.length > 1000) history.length = 1000;
  saveHistory();
  if (currentPanel === 'history') renderPanel();
}

/* ═══════════════════════════ URLs ═══════════════════════════ */
function searchUrl(q) {
  const first = q.split(/\s+/)[0].toLowerCase();
  const rest = q.slice(first.length).trim();
  if (BANGS[first] && rest) return BANGS[first] + encodeURIComponent(rest);
  return ENGINES[settings.engine].url + encodeURIComponent(q);
}

function formatUrl(input) {
  const u = (input || '').trim();
  if (!u || /^deedler:\/\//i.test(u)) return HOME;
  if (/^(https?:\/\/|file:\/\/|view-source:|about:blank)/i.test(u)) return u;
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#].*)?$/i.test(u)) return 'http://' + u;
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(u)) return 'https://' + u;
  return searchUrl(u);
}

function tryMath(q) {
  if (!/^[\d\s+\-*/().,%^]+$/.test(q) || !/[+\-*/^%]/.test(q) || !/\d/.test(q)) return null;
  try {
    const expr = q.replace(/,/g, '.').replace(/\^/g, '**').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    const v = Function(`"use strict";return (${expr})`)();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return String(Math.round(v * 1e10) / 1e10);
  } catch { return null; }
}

/* ═══════════════════════════ Estado das abas ═══════════════════════════ */
const tabs = new Map();
let tabCount = 0;
let activeTabId = null;
let dragId = null;

const tabsContainer = $('tabs-container');
const viewsContainer = $('views-container');
const urlBar = $('url-bar');

const activeTab = () => tabs.get(activeTabId);
const isActive = (t) => t.id === activeTabId;
const getOrder = () => [...tabsContainer.children].map((c) => c.dataset.id);

const saveSession = debounce(() => {
  const list = getOrder().map((id) => tabs.get(id)).filter((t) => t && (t.url || t.pendingUrl));
  store.set('session', {
    tabs: list.map((t) => ({ url: t.pendingUrl || t.url, title: t.title, pinned: t.pinned })),
    active: Math.max(0, list.findIndex((t) => t.id === activeTabId))
  });
}, 400);

/* ═══════════════════════════ Criar aba ═══════════════════════════ */
function createTab(input = HOME, opts = {}) {
  const id = `tab-${++tabCount}`;
  const t = {
    id, title: 'Nova aba', url: '', favicon: '', loading: false, audible: false, muted: false,
    pinned: !!opts.pinned, zoom: 1, dark: false, darkKey: null, ready: false,
    isHome: true, pendingUrl: null
  };
  tabs.set(id, t);

  /* ── botão da aba ── */
  t.iconEl = el('span', { className: 'tab-icon', text: '🌐' });
  t.spinnerEl = el('span', { className: 'tab-spinner' });
  t.titleEl = el('span', { className: 'tab-title', text: t.title });
  t.audioEl = el('button', {
    className: 'tab-audio', text: '🔊', title: 'Silenciar / ativar som',
    on: { click: (e) => { e.stopPropagation(); toggleMute(t); } }
  });
  const closeBtn = el('span', { className: 'close-btn', text: '×', title: 'Fechar aba', on: { click: (e) => { e.stopPropagation(); closeTab(id); } } });
  t.tabEl = el('div', { className: 'tab', draggable: true, dataset: { id } }, t.iconEl, t.spinnerEl, t.titleEl, t.audioEl, closeBtn);

  t.tabEl.addEventListener('click', () => switchTab(id));
  t.tabEl.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(id); } });
  t.tabEl.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabMenu(e.clientX, e.clientY, t); });

  // arrastar para reordenar
  t.tabEl.addEventListener('dragstart', (e) => {
    dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    t.tabEl.classList.add('dragging');
  });
  t.tabEl.addEventListener('dragend', () => {
    dragId = null;
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
    saveSession();
  });
  t.tabEl.addEventListener('dragover', (e) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    const r = t.tabEl.getBoundingClientRect();
    const before = e.clientX < r.left + r.width / 2;
    t.tabEl.classList.toggle('drop-before', before);
    t.tabEl.classList.toggle('drop-after', !before);
  });
  t.tabEl.addEventListener('dragleave', () => t.tabEl.classList.remove('drop-before', 'drop-after'));
  t.tabEl.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragId || dragId === id) return;
    const dragged = tabs.get(dragId);
    const r = t.tabEl.getBoundingClientRect();
    if (dragged) (e.clientX < r.left + r.width / 2 ? t.tabEl.before(dragged.tabEl) : t.tabEl.after(dragged.tabEl));
    t.tabEl.classList.remove('drop-before', 'drop-after');
  });

  /* ── painel da aba (home + webview + erro) ── */
  t.homeEl = el('div', { className: 'pane-home' });
  t.webview = document.createElement('webview');
  t.webview.setAttribute('allowpopups', '');
  t.errorEl = el('div', { className: 'pane-error' });
  t.paneEl = el('div', { className: 'tab-pane', dataset: { mode: 'home', error: '0' } }, t.homeEl, t.webview, t.errorEl);
  viewsContainer.append(t.paneEl);

  const after = opts.after && tabs.get(opts.after);
  if (after) after.tabEl.after(t.tabEl);
  else tabsContainer.append(t.tabEl);
  if (t.pinned) placePinned(t);

  renderHome(t);
  wireWebview(t);
  renderTab(t);

  const url = formatUrl(input);
  if (url !== HOME) {
    if (opts.lazy) {
      t.isHome = false;
      t.url = url;
      t.pendingUrl = url;
      if (opts.title) { t.title = opts.title; renderTab(t); }
    } else {
      navigate(id, url);
    }
  }

  if (!opts.background) switchTab(id);
  saveSession();
  return id;
}

/* ═══════════════════════════ Eventos do webview ═══════════════════════════ */
function wireWebview(t) {
  const wv = t.webview;

  wv.addEventListener('dom-ready', () => {
    t.ready = true;
    t.zoom = zoomByHost[hostOf(t.url)] || 1;
    if (t.zoom !== 1) safe(() => wv.setZoomFactor(t.zoom));
    if (t.dark) { t.darkKey = null; applyDark(t); }
    if (isActive(t)) { updateNav(); updateZoomBadge(); }
  });

  wv.addEventListener('page-title-updated', (e) => {
    t.title = e.title || t.url;
    renderTab(t);
    const h = history[0];
    if (h && h.url === t.url) { h.title = t.title; saveHistory(); }
    if (isActive(t)) updateWindowTitle();
    saveSession();
  });

  wv.addEventListener('page-favicon-updated', (e) => {
    t.favicon = (e.favicons || [])[0] || '';
    renderTab(t);
  });

  wv.addEventListener('did-start-loading', () => {
    t.loading = true;
    clearError(t);
    renderTab(t);
    if (isActive(t)) updateLoadingBar();
  });

  wv.addEventListener('did-stop-loading', () => {
    t.loading = false;
    renderTab(t);
    if (isActive(t)) { updateLoadingBar(); updateNav(); }
  });

  wv.addEventListener('did-navigate', (e) => onNavigated(t, e.url, true));
  wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) onNavigated(t, e.url, false); });

  wv.addEventListener('did-fail-load', (e) => {
    if (e.isMainFrame && e.errorCode !== -3) showError(t, e);
  });

  wv.addEventListener('media-started-playing', () => { t.audible = true; renderTab(t); });
  wv.addEventListener('media-paused', () => { t.audible = false; renderTab(t); });
  wv.addEventListener('enter-html-full-screen', () => document.body.classList.add('html-fs'));
  wv.addEventListener('leave-html-full-screen', () => document.body.classList.remove('html-fs'));
  wv.addEventListener('found-in-page', (e) => { if (isActive(t)) updateFindCount(e.result); });
}

function onNavigated(t, url, record) {
  t.url = url;
  t.isHome = false;
  t.pendingUrl = null;
  t.paneEl.dataset.mode = 'web';
  if (record) addHistory(t.title, url);
  if (isActive(t)) { syncUrlBar(); updateNav(); updateStar(); updateSiteInfo(); }
  renderBookmarksBar();
  saveSession();
}

const ERROR_TEXT = {
  '-105': 'Não encontrei esse site. Confere se o endereço está certo?',
  '-106': 'Você está sem internet no momento.',
  '-102': 'O site recusou a conexão.',
  '-118': 'O site demorou demais para responder.',
  '-109': 'Não consegui chegar nesse endereço.',
  '-201': 'O relógio do seu computador parece errado (certificado inválido).',
  '-200': 'O certificado de segurança desse site não é confiável.',
  '-202': 'O certificado de segurança desse site não é confiável.'
};

function showError(t, e) {
  const msg = ERROR_TEXT[String(e.errorCode)] || 'Não deu para carregar essa página.';
  t.errorEl.replaceChildren(
    el('div', { className: 'err-emoji', text: '😵' }),
    el('div', { className: 'err-title', text: 'Eita, deu ruim' }),
    el('div', { className: 'err-msg', text: msg }),
    el('div', { className: 'err-code', text: `${e.errorDescription || ''} (${e.errorCode}) — ${e.validatedURL || t.url}` }),
    el('button', { className: 'btn', text: 'Tentar de novo', on: { click: () => reloadTab(t) } })
  );
  t.paneEl.dataset.error = '1';
  t.loading = false;
  renderTab(t);
  if (isActive(t)) updateLoadingBar();
}

function clearError(t) { t.paneEl.dataset.error = '0'; }

/* ═══════════════════════════ Renderização da aba ═══════════════════════════ */
function renderTab(t) {
  t.titleEl.textContent = t.title || 'Nova aba';
  t.tabEl.title = t.title || '';
  t.tabEl.classList.toggle('pinned', t.pinned);
  t.tabEl.classList.toggle('loading', t.loading);
  t.tabEl.classList.toggle('audible', t.audible && !t.muted);
  t.tabEl.classList.toggle('muted', t.muted);
  t.audioEl.textContent = t.muted ? '🔇' : '🔊';

  t.iconEl.replaceChildren();
  if (t.favicon && !t.isHome) {
    const img = el('img', { src: t.favicon, alt: '' });
    img.addEventListener('error', () => { t.iconEl.textContent = '🌐'; });
    t.iconEl.append(img);
  } else {
    t.iconEl.textContent = t.isHome ? '🔥' : '🌐';
  }
}

function placePinned(t) {
  const pinnedTabs = getOrder().map((id) => tabs.get(id)).filter((x) => x && x.pinned && x.id !== t.id);
  if (t.pinned) {
    const last = pinnedTabs[pinnedTabs.length - 1];
    if (last) last.tabEl.after(t.tabEl);
    else tabsContainer.prepend(t.tabEl);
  } else {
    const last = pinnedTabs[pinnedTabs.length - 1];
    if (last) last.tabEl.after(t.tabEl);
  }
}

/* ═══════════════════════════ Navegação ═══════════════════════════ */
function navigate(id, input) {
  const t = tabs.get(id);
  if (!t) return;
  const url = formatUrl(input);
  if (url === HOME) return goHome(t);

  t.isHome = false;
  t.url = url;
  t.pendingUrl = null;
  t.paneEl.dataset.mode = 'web';
  clearError(t);

  if (t.ready) t.webview.loadURL(url).catch(() => {});
  else t.webview.src = url;

  if (isActive(t)) { syncUrlBar(); updateSiteInfo(); updateStar(); }
  renderTab(t);
}

function goHome(t) {
  t.isHome = true;
  t.url = '';
  t.title = 'Nova aba';
  t.favicon = '';
  t.loading = false;
  t.paneEl.dataset.mode = 'home';
  clearError(t);
  renderHome(t);
  renderTab(t);
  if (isActive(t)) { syncChrome(); urlBar.focus(); }
  saveSession();
}

function reloadTab(t, hard = false) {
  if (!t || t.isHome) return;
  clearError(t);
  if (t.pendingUrl) return navigate(t.id, t.pendingUrl);
  safe(() => (hard ? t.webview.reloadIgnoringCache() : t.webview.reload()));
}

function switchTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  tabs.forEach((x) => {
    x.tabEl.classList.toggle('active', x.id === id);
    x.paneEl.classList.toggle('active', x.id === id);
  });
  activeTabId = id;
  closeFind();
  if (t.pendingUrl) navigate(id, t.pendingUrl); // carregamento preguiçoso de abas restauradas
  syncChrome();
  t.tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (t.isHome) urlBar.focus();
  saveSession();
}

function closeTab(id, record = true) {
  const t = tabs.get(id);
  if (!t) return;
  if (record && !t.isHome && t.url) {
    closedTabs.push({ url: t.url, pinned: t.pinned });
    if (closedTabs.length > 15) closedTabs.shift();
  }
  const order = getOrder();
  const idx = order.indexOf(id);
  t.tabEl.remove();
  t.paneEl.remove();
  tabs.delete(id);

  if (activeTabId === id) {
    const next = order[idx + 1] && order[idx + 1] !== id ? order[idx + 1] : order[idx - 1];
    activeTabId = null;
    if (next && tabs.has(next)) switchTab(next);
    else createTab();
  }
  saveSession();
}

function reopenTab() {
  const last = closedTabs.pop();
  if (!last) return toast('Nenhuma aba fechada para reabrir');
  createTab(last.url, { pinned: last.pinned });
}

function toggleMute(t) {
  t.muted = !t.muted;
  safe(() => t.webview.setAudioMuted(t.muted));
  renderTab(t);
}

function togglePin(t) {
  t.pinned = !t.pinned;
  placePinned(t);
  renderTab(t);
  saveSession();
}

function cycleTab(dir) {
  const order = getOrder();
  const i = order.indexOf(activeTabId);
  switchTab(order[(i + dir + order.length) % order.length]);
}

/* ═══════════════════════════ Barra de navegação ═══════════════════════════ */
function syncUrlBar() {
  const t = activeTab();
  if (document.activeElement !== urlBar || !urlBar.dataset.dirty) {
    urlBar.value = t && !t.isHome ? t.url : '';
    delete urlBar.dataset.dirty;
  }
}

function updateWindowTitle() {
  const t = activeTab();
  document.title = t && !t.isHome && t.title ? `${t.title} — Deedler` : 'Deedler Browser';
}

function updateNav() {
  const t = activeTab();
  const web = t && !t.isHome && t.ready;
  $('btn-back').disabled = !(web && safe(() => t.webview.canGoBack(), false));
  $('btn-forward').disabled = !(web && safe(() => t.webview.canGoForward(), false));
}

function updateSiteInfo() {
  const t = activeTab();
  const si = $('site-info');
  if (!t || t.isHome) { si.textContent = ''; si.title = ''; return; }
  if (t.url.startsWith('https:')) { si.textContent = '🔒'; si.title = 'Conexão segura'; }
  else if (t.url.startsWith('http:')) { si.textContent = '⚠️'; si.title = 'Conexão NÃO segura'; }
  else { si.textContent = 'ℹ️'; si.title = ''; }
}

function updateLoadingBar() {
  const t = activeTab();
  $('load-bar').classList.toggle('active', !!(t && t.loading));
}

function updateStar() {
  const t = activeTab();
  const on = !!(t && !t.isHome && bookmarks.some((b) => normUrl(b.url) === normUrl(t.url)));
  $('btn-star').textContent = on ? '★' : '☆';
  $('btn-star').classList.toggle('on', on);
}

function updateZoomBadge() {
  const t = activeTab();
  const b = $('btn-zoom');
  const z = t ? t.zoom : 1;
  b.textContent = `${Math.round(z * 100)}%`;
  b.classList.toggle('visible', z !== 1);
}

function updateDarkBtn() {
  const t = activeTab();
  $('btn-dark').classList.toggle('on', !!(t && t.dark));
}

function syncChrome() {
  syncUrlBar();
  updateNav();
  updateSiteInfo();
  updateStar();
  updateZoomBadge();
  updateDarkBtn();
  updateLoadingBar();
  updateWindowTitle();
}

$('btn-back').addEventListener('click', () => { const t = activeTab(); if (t && !t.isHome) safe(() => t.webview.goBack()); });
$('btn-forward').addEventListener('click', () => { const t = activeTab(); if (t && !t.isHome) safe(() => t.webview.goForward()); });
$('btn-reload').addEventListener('click', () => {
  const t = activeTab();
  if (!t || t.isHome) return;
  if (t.loading) safe(() => t.webview.stop());
  else reloadTab(t);
});
$('add-tab-btn').addEventListener('click', () => createTab());
$('top-bar').addEventListener('dblclick', (e) => { if (e.target === $('top-bar') || e.target === tabsContainer) createTab(); });
tabsContainer.addEventListener('wheel', (e) => {
  if (e.deltaY) { tabsContainer.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });

/* ═══════════════════════════ Barra de endereço + sugestões ═══════════════════════════ */
let sugg = [];
let suggIdx = -1;
const suggBox = $('suggestions');

function buildSuggestions(q) {
  q = q.trim();
  if (!q) return [];
  const ql = q.toLowerCase();
  const out = [{ icon: '🔍', title: formatUrl(q) === searchUrl(q) ? `Pesquisar "${q}"` : q, sub: formatUrl(q) === searchUrl(q) ? ENGINES[settings.engine].name : 'Ir para o endereço', run: () => navigate(activeTabId, q) }];
  const match = (o) => (o.title || '').toLowerCase().includes(ql) || (o.url || '').toLowerCase().includes(ql);

  const math = tryMath(q);
  if (math !== null) out.push({ icon: '🧮', title: `= ${math}`, sub: 'Copiar resultado', run: () => { api.copyText?.(math); toast('Resultado copiado'); } });

  const seen = new Set();
  [...tabs.values()].filter((t) => !t.isHome && match(t)).slice(0, 3).forEach((t) => {
    seen.add(normUrl(t.url));
    out.push({ icon: '🗂️', title: t.title, sub: 'Ir para a aba', run: () => switchTab(t.id) });
  });
  bookmarks.filter(match).slice(0, 4).forEach((b) => {
    if (seen.has(normUrl(b.url))) return;
    seen.add(normUrl(b.url));
    out.push({ icon: '⭐', title: b.title, sub: b.url, run: () => navigate(activeTabId, b.url) });
  });
  let n = 0;
  for (const h of history) {
    if (n >= 5) break;
    if (seen.has(normUrl(h.url)) || !match(h)) continue;
    seen.add(normUrl(h.url));
    n++;
    out.push({ icon: '🕘', title: h.title, sub: h.url, run: () => navigate(activeTabId, h.url) });
  }
  return out.slice(0, 9);
}

function renderSuggestions() {
  sugg = buildSuggestions(urlBar.value);
  suggIdx = -1;
  suggBox.replaceChildren();
  if (!sugg.length) return suggBox.classList.remove('visible');
  sugg.forEach((s, i) => {
    const row = el('div', { className: 'sugg', dataset: { i } },
      el('span', { className: 's-icon', text: s.icon }),
      el('span', { className: 's-title', text: s.title }),
      el('span', { className: 's-sub', text: s.sub }));
    row.addEventListener('mousedown', (e) => { e.preventDefault(); hideSuggestions(); s.run(); });
    suggBox.append(row);
  });
  suggBox.classList.add('visible');
}

function hideSuggestions() { suggBox.classList.remove('visible'); suggIdx = -1; }

function moveSugg(dir) {
  if (!sugg.length) return;
  suggIdx = (suggIdx + dir + sugg.length) % sugg.length;
  [...suggBox.children].forEach((c, i) => c.classList.toggle('sel', i === suggIdx));
}

urlBar.addEventListener('input', () => { urlBar.dataset.dirty = '1'; renderSuggestions(); });
urlBar.addEventListener('focus', () => urlBar.select());
urlBar.addEventListener('blur', () => { hideSuggestions(); delete urlBar.dataset.dirty; syncUrlBar(); });
urlBar.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSugg(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSugg(-1); }
  else if (e.key === 'Enter') {
    if (suggIdx >= 0 && sugg[suggIdx]) sugg[suggIdx].run();
    else navigate(activeTabId, urlBar.value);
    hideSuggestions();
    urlBar.blur();
  }
});

/* ═══════════════════════════ Favoritos ═══════════════════════════ */
function saveBookmarks() {
  store.set('bookmarks', bookmarks);
  renderBookmarksBar();
  updateStar();
  refreshHomes();
  applySettings();
  if (currentPanel === 'bookmarks') renderPanel();
}

function toggleBookmark() {
  const t = activeTab();
  if (!t || t.isHome) return toast('Abra uma página para favoritar');
  const i = bookmarks.findIndex((b) => normUrl(b.url) === normUrl(t.url));
  if (i >= 0) { bookmarks.splice(i, 1); toast('Favorito removido'); }
  else { bookmarks.push({ url: t.url, title: t.title || t.url, addedAt: Date.now() }); toast('⭐ Página favoritada'); }
  saveBookmarks();
}

function renderBookmarksBar() {
  const bar = $('bookmarks-bar');
  bar.replaceChildren(...bookmarks.map((b) => {
    const chip = el('button', { className: 'bm-chip', title: b.url }, avatar(hostOf(b.url) || b.title), el('span', { text: b.title }));
    chip.addEventListener('click', () => navigate(activeTabId, b.url));
    chip.addEventListener('auxclick', (e) => { if (e.button === 1) createTab(b.url, { after: activeTabId }); });
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { label: 'Abrir em nova aba', run: () => createTab(b.url, { after: activeTabId }) },
        { label: 'Remover favorito', run: () => { bookmarks = bookmarks.filter((x) => x !== b); saveBookmarks(); } }
      ]);
    });
    return chip;
  }));
  bar.classList.toggle('visible', !!settings.bookmarksBar && bookmarks.length > 0);
}

/* ═══════════════════════════ Página inicial ═══════════════════════════ */
const DEFAULT_DIAL = [
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'X', url: 'https://x.com' },
  { title: 'Discord', url: 'https://discord.com/app' },
  { title: 'Reddit', url: 'https://www.reddit.com' }
];

const TIPS = [
  'Dica: Ctrl+Shift+P abre a paleta de comandos.',
  'Dica: digite "yt lofi" na barra para buscar direto no YouTube.',
  'Dica: digite uma conta (ex.: 15% * 240) e veja o resultado na hora.',
  'Dica: Ctrl+Shift+T reabre a última aba fechada.',
  'Dica: Ctrl+Shift+D força o modo escuro em qualquer site.',
  'Dica: Ctrl+Shift+S tira print da página (copia e salva em Downloads).',
  'Dica: arraste as abas para reordenar e clique com o direito para fixar.'
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const clockText = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function renderHome(t) {
  const input = el('input', { type: 'text', className: 'home-search-bar', placeholder: `Pesquisar com ${ENGINES[settings.engine].name} ou digitar URL…` });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(t.id, input.value); });

  const dial = [...bookmarks, ...DEFAULT_DIAL.filter((d) => !bookmarks.some((b) => hostOf(b.url) === hostOf(d.url)))].slice(0, 8);
  const grid = el('div', { className: 'dial' }, dial.map((d) => {
    const tile = el('button', { className: 'dial-tile', title: d.url }, avatar(hostOf(d.url) || d.title, 44), el('span', { text: d.title }));
    tile.addEventListener('click', () => navigate(t.id, d.url));
    tile.addEventListener('auxclick', (e) => { if (e.button === 1) createTab(d.url, { after: t.id, background: true }); });
    return tile;
  }));

  t.homeEl.replaceChildren(
    el('div', { className: 'home-clock', text: clockText() }),
    el('div', { className: 'home-greet', text: greeting() }),
    el('div', { className: 'home-card' },
      el('img', { src: './assets/icon.png', className: 'home-logo-img', alt: 'deedler' }),
      el('div', { className: 'home-title', text: 'deedler' }),
      el('div', { className: 'home-subtitle', text: 'O navegador oficial da deedle' }),
      input),
    grid,
    el('div', { className: 'home-tip', text: TIPS[Math.floor(Math.random() * TIPS.length)] })
  );
}

function refreshHomes() { tabs.forEach((t) => { if (t.isHome) renderHome(t); }); }
setInterval(() => document.querySelectorAll('.home-clock').forEach((c) => { c.textContent = clockText(); }), 20000);

/* ═══════════════════════════ Zoom, modo escuro, print ═══════════════════════════ */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

function setZoom(t, z) {
  t.zoom = z;
  const host = hostOf(t.url);
  if (host) {
    if (z === 1) delete zoomByHost[host]; else zoomByHost[host] = z;
    store.set('zoom', zoomByHost);
  }
  if (t.ready) safe(() => t.webview.setZoomFactor(z));
  if (isActive(t)) updateZoomBadge();
}

function zoomBy(dir) {
  const t = activeTab();
  if (!t || t.isHome) return;
  let i = ZOOM_STEPS.findIndex((s) => s >= t.zoom - 0.001);
  if (i < 0) i = ZOOM_STEPS.length - 1;
  i = Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir));
  setZoom(t, ZOOM_STEPS[i]);
}

$('btn-zoom').addEventListener('click', () => { const t = activeTab(); if (t) setZoom(t, 1); });

const DARK_CSS = 'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}' +
  'img,video,canvas,picture,iframe,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';

async function applyDark(t) {
  try { t.darkKey = await t.webview.insertCSS(DARK_CSS); } catch {}
}
async function removeDark(t) {
  if (!t.darkKey) return;
  try { await t.webview.removeInsertedCSS(t.darkKey); } catch {}
  t.darkKey = null;
}
async function toggleDark() {
  const t = activeTab();
  if (!t || t.isHome) return toast('Abra uma página primeiro');
  t.dark = !t.dark;
  if (t.dark) await applyDark(t); else await removeDark(t);
  updateDarkBtn();
  toast(t.dark ? '🌙 Modo escuro forçado ligado' : '☀️ Modo escuro forçado desligado');
}
$('btn-dark').addEventListener('click', toggleDark);

async function screenshot() {
  const t = activeTab();
  if (!t || t.isHome) return toast('Abra uma página primeiro');
  try {
    const id = t.webview.getWebContentsId();
    const file = await api.capturePage?.(id);
    toast(file ? '📸 Print copiado e salvo em Downloads' : 'Não consegui capturar a página');
  } catch { toast('Não consegui capturar a página'); }
}
$('btn-shot').addEventListener('click', screenshot);

function openDevTools() {
  const t = activeTab();
  if (!t || t.isHome) return;
  safe(() => api.toggleDevTools?.(t.webview.getWebContentsId()));
}

/* ═══════════════════════════ Buscar na página ═══════════════════════════ */
const findBar = $('find-bar');
const findInput = $('find-input');

function openFind() {
  const t = activeTab();
  if (!t || t.isHome) return;
  positionOverlays();
  findBar.classList.add('visible');
  findInput.focus();
  findInput.select();
}

function closeFind() {
  if (!findBar.classList.contains('visible')) return;
  findBar.classList.remove('visible');
  $('find-count').textContent = '';
  tabs.forEach((t) => { if (t.ready) safe(() => t.webview.stopFindInPage('clearSelection')); });
}

function updateFindCount(r) {
  $('find-count').textContent = r && r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : '0/0';
}

function findNext(forward = true) {
  const t = activeTab();
  if (!t || !findInput.value) return;
  safe(() => t.webview.findInPage(findInput.value, { findNext: true, forward }));
}

findInput.addEventListener('input', () => {
  const t = activeTab();
  if (!t) return;
  if (findInput.value) safe(() => t.webview.findInPage(findInput.value));
  else { safe(() => t.webview.stopFindInPage('clearSelection')); $('find-count').textContent = ''; }
});
findInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') findNext(!e.shiftKey); });
$('find-next').addEventListener('click', () => findNext(true));
$('find-prev').addEventListener('click', () => findNext(false));
$('find-close').addEventListener('click', closeFind);

/* ═══════════════════════════ Menu flutuante (abas, favoritos) ═══════════════════════════ */
const ctxMenu = $('ctx-menu');

function showMenu(x, y, items) {
  ctxMenu.replaceChildren(...items.map((it) => {
    if (it === 'sep') return el('div', { className: 'ctx-sep' });
    const row = el('div', { className: 'ctx-item' + (it.disabled ? ' disabled' : ''), text: it.label });
    row.addEventListener('click', () => { hideMenu(); if (!it.disabled) it.run(); });
    return row;
  }));
  ctxMenu.classList.add('visible');
  const w = ctxMenu.offsetWidth, h = ctxMenu.offsetHeight;
  ctxMenu.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
  ctxMenu.style.top = Math.min(y, window.innerHeight - h - 8) + 'px';
}
function hideMenu() { ctxMenu.classList.remove('visible'); }
document.addEventListener('mousedown', (e) => { if (!ctxMenu.contains(e.target)) hideMenu(); });
window.addEventListener('blur', hideMenu);

function showTabMenu(x, y, t) {
  const order = getOrder();
  const idx = order.indexOf(t.id);
  showMenu(x, y, [
    { label: 'Recarregar', run: () => reloadTab(t), disabled: t.isHome },
    { label: 'Duplicar', run: () => createTab(t.url || HOME, { after: t.id }) },
    { label: t.pinned ? 'Desafixar aba' : 'Fixar aba', run: () => togglePin(t) },
    { label: t.muted ? 'Ativar som da aba' : 'Silenciar aba', run: () => toggleMute(t), disabled: t.isHome },
    { label: 'Copiar endereço', run: () => api.copyText?.(t.url), disabled: t.isHome },
    'sep',
    { label: 'Fechar aba', run: () => closeTab(t.id) },
    { label: 'Fechar outras abas', run: () => order.filter((i) => i !== t.id).forEach((i) => closeTab(i)), disabled: order.length < 2 },
    { label: 'Fechar abas à direita', run: () => order.slice(idx + 1).forEach((i) => closeTab(i)), disabled: idx === order.length - 1 }
  ]);
}

/* ═══════════════════════════ Painel lateral ═══════════════════════════ */
const sidebar = $('sidebar-panel');
let currentPanel = null;
let historyFilter = '';

function positionOverlays() {
  const top = viewsContainer.getBoundingClientRect().top + 8;
  sidebar.style.top = top + 'px';
  findBar.style.top = top + 'px';
}

function openPanel(name) {
  if (currentPanel === name) return closePanel();
  currentPanel = name;
  positionOverlays();
  sidebar.classList.add('visible');
  renderPanel();
}

function closePanel() {
  currentPanel = null;
  sidebar.classList.remove('visible');
}

let panelQueued = false;
function renderPanelSoon() {
  if (panelQueued) return;
  panelQueued = true;
  requestAnimationFrame(() => { panelQueued = false; if (currentPanel === 'downloads') renderPanel(); });
}

function dayLabel(ts) {
  const d = new Date(ts), today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function panelItem(title, sub, extra) {
  return el('div', { className: 'panel-item' }, el('div', { className: 'pi-main' }, el('strong', { text: title }), el('small', { text: sub || '' })), extra);
}

function renderPanel() {
  const list = $('panel-list');
  const tools = $('panel-tools');
  tools.replaceChildren();
  list.replaceChildren();

  if (currentPanel === 'history') {
    $('panel-title').textContent = 'Histórico 🔥';
    const search = el('input', { type: 'text', className: 'panel-input', placeholder: 'Buscar no histórico…', value: historyFilter });
    search.addEventListener('input', () => {
      historyFilter = search.value;
      renderPanel();
      $('panel-tools').querySelector('input').focus();
    });
    tools.append(search, el('button', {
      className: 'btn', text: 'Limpar',
      on: { click: () => { if (confirm('Apagar todo o histórico?')) { history = []; store.set('history', []); renderPanel(); } } }
    }));
    const q = historyFilter.toLowerCase();
    const items = history.filter((h) => !q || h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)).slice(0, 200);
    if (!items.length) return list.append(el('div', { className: 'panel-empty', text: 'Nada por aqui ainda.' }));
    let lastDay = '';
    items.forEach((h) => {
      const day = dayLabel(h.time);
      if (day !== lastDay) { list.append(el('div', { className: 'panel-day', text: day })); lastDay = day; }
      const row = panelItem(h.title, `${new Date(h.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${h.url}`,
        el('button', { className: 'x-btn', text: '×', title: 'Remover', on: { click: (e) => { e.stopPropagation(); history = history.filter((x) => x !== h); store.set('history', history); renderPanel(); } } }));
      row.classList.add('clickable');
      row.addEventListener('click', () => navigate(activeTabId, h.url));
      row.addEventListener('auxclick', (e) => { if (e.button === 1) createTab(h.url, { after: activeTabId, background: true }); });
      list.append(row);
    });
  }

  else if (currentPanel === 'downloads') {
    $('panel-title').textContent = 'Downloads 📥';
    if (!downloadLog.length) return list.append(el('div', { className: 'panel-empty', text: 'Nenhum download nesta sessão.' }));
    downloadLog.forEach((d) => {
      const status = d.state === 'completed' ? 'Concluído ✅' : d.state === 'interrupted' ? 'Interrompido ❌' : d.state === 'cancelled' ? 'Cancelado' : d.state === 'paused' ? 'Pausado' : `Baixando ${d.progress || 0}%`;
      const bar = d.state === 'progressing' || d.state === 'paused' ? el('div', { className: 'dl-bar' }, el('div', { style: { width: (d.progress || 0) + '%' } })) : null;
      const actions = d.state === 'completed' && d.path ? el('div', { className: 'dl-actions' },
        el('button', { className: 'btn', text: 'Abrir', on: { click: () => api.openPath?.(d.path) } }),
        el('button', { className: 'btn', text: 'Mostrar na pasta', on: { click: () => api.showInFolder?.(d.path) } })) : null;
      const size = d.total ? ` · ${fmtBytes(d.received || d.total)}${d.state === 'progressing' ? ' / ' + fmtBytes(d.total) : ''}` : '';
      list.append(el('div', { className: 'panel-item col' }, el('strong', { text: d.fileName }), el('small', { text: status + size }), bar, actions));
    });
  }

  else if (currentPanel === 'bookmarks') {
    $('panel-title').textContent = 'Favoritos ⭐';
    tools.append(el('button', { className: 'btn', text: '＋ Favoritar página atual', on: { click: toggleBookmark } }));
    if (!bookmarks.length) return list.append(el('div', { className: 'panel-empty', text: 'Use Ctrl+D ou a estrela na barra de endereço.' }));
    bookmarks.forEach((b) => {
      const row = panelItem(b.title, b.url, el('button', { className: 'x-btn', text: '×', title: 'Remover', on: { click: (e) => { e.stopPropagation(); bookmarks = bookmarks.filter((x) => x !== b); saveBookmarks(); } } }));
      row.classList.add('clickable');
      row.addEventListener('click', () => navigate(activeTabId, b.url));
      row.addEventListener('auxclick', (e) => { if (e.button === 1) createTab(b.url, { after: activeTabId, background: true }); });
      list.append(row);
    });
  }

  else if (currentPanel === 'settings') {
    $('panel-title').textContent = 'Configurações deeddle ⚙️';
    const row = (label, control) => el('div', { className: 'setting-row' }, el('span', { text: label }), control);

    const engineSel = el('select', { className: 'panel-input' }, Object.entries(ENGINES).map(([k, v]) => el('option', { value: k, text: v.name, selected: settings.engine === k })));
    engineSel.addEventListener('change', () => { settings.engine = engineSel.value; applySettings(); refreshHomes(); });

    const color = el('input', { type: 'color', value: settings.accent, className: 'color-input' });
    color.addEventListener('input', () => { settings.accent = color.value; applySettings(); });

    const check = (key, onChange) => {
      const c = el('input', { type: 'checkbox', checked: !!settings[key] });
      c.addEventListener('change', () => { settings[key] = c.checked; applySettings(); onChange?.(); });
      return c;
    };

    const info = el('div', { className: 'panel-item col' }, el('strong', { text: 'Sobre' }), el('small', { text: 'Deedler v2.0.0' }));
    api.info?.().then((i) => {
      info.append(el('small', { text: `Anúncios/rastreadores bloqueados: ${i.blocked}` }));
      if (document.body.classList.contains('dev')) info.append(el('small', { text: `Electron ${i.electron} · Chromium ${i.chrome} · Node ${i.node}` }));
    }).catch(() => {});

    list.append(
      row('Mecanismo de busca', engineSel),
      row('Cor de destaque', color),
      row('Bloquear anúncios e rastreadores', check('adblock')),
      row('Restaurar abas ao abrir', check('restore')),
      row('Mostrar barra de favoritos', check('bookmarksBar')),
      el('button', {
        className: 'btn wide', text: 'Limpar cookies e cache',
        on: { click: async () => { if (confirm('Isso desloga você dos sites. Continuar?')) { await api.clearData?.(); toast('Dados de navegação limpos'); } } }
      }),
      el('button', { className: 'btn wide', text: 'Restaurar cor padrão', on: { click: () => { settings.accent = DEFAULT_SETTINGS.accent; applySettings(); renderPanel(); } } }),
      info
    );
  }
}

$('btn-history').addEventListener('click', () => openPanel('history'));
$('btn-downloads').addEventListener('click', () => openPanel('downloads'));
$('btn-bookmarks').addEventListener('click', () => openPanel('bookmarks'));
$('btn-settings').addEventListener('click', () => openPanel('settings'));
$('btn-close-panel').addEventListener('click', closePanel);
$('btn-star').addEventListener('mousedown', (e) => e.preventDefault());
$('btn-star').addEventListener('click', toggleBookmark);

/* ═══════════════════════════ Downloads ═══════════════════════════ */
function updateDlBadge() {
  const n = downloadLog.filter((d) => d.state === 'progressing' || d.state === 'paused').length;
  const b = $('dl-badge');
  b.textContent = n;
  b.classList.toggle('visible', n > 0);
}

api.onDownloadStarted?.((d) => {
  downloadLog.unshift({ id: d.id, fileName: d.fileName, total: d.totalBytes, received: 0, progress: 0, state: 'progressing' });
  toast(`📥 Baixando ${d.fileName}`);
  updateDlBadge();
  renderPanelSoon();
});
api.onDownloadProgress?.((d) => {
  const item = downloadLog.find((x) => x.id === d.id);
  if (item) Object.assign(item, { received: d.received, total: d.total, progress: d.progress, state: d.state });
  renderPanelSoon();
});
api.onDownloadCompleted?.((d) => {
  const item = downloadLog.find((x) => x.id === d.id);
  if (item) Object.assign(item, { state: d.state, path: d.path, progress: 100 });
  if (d.state === 'completed') toast(`✅ Download concluído: ${d.fileName}`);
  else if (d.state === 'interrupted') toast(`❌ Download interrompido: ${d.fileName}`);
  updateDlBadge();
  renderPanelSoon();
});

/* ═══════════════════════════ Paleta de comandos ═══════════════════════════ */
const palette = $('palette');
const paletteInput = $('palette-input');
let paletteItems = [];
let paletteIdx = 0;

function getCommands() {
  const t = activeTab();
  const web = t && !t.isHome;
  const cmds = [
    { icon: '➕', title: 'Nova aba', hint: 'Ctrl+T', run: () => createTab() },
    { icon: '↩️', title: 'Reabrir aba fechada', hint: 'Ctrl+Shift+T', run: reopenTab },
    { icon: '🏠', title: 'Ir para a página inicial', hint: 'Alt+Home', run: () => t && goHome(t) },
    { icon: '📌', title: t && t.pinned ? 'Desafixar aba' : 'Fixar aba', run: () => t && togglePin(t) },
    { icon: '📑', title: 'Duplicar aba', run: () => t && createTab(t.url || HOME, { after: t.id }) },
    { icon: '🧹', title: 'Fechar outras abas', run: () => getOrder().filter((i) => i !== activeTabId).forEach((i) => closeTab(i)) },
    { icon: '⭐', title: 'Favoritar / desfavoritar página', hint: 'Ctrl+D', run: toggleBookmark },
    { icon: '🔎', title: 'Buscar na página', hint: 'Ctrl+F', run: openFind },
    { icon: '🌙', title: 'Alternar modo escuro forçado', hint: 'Ctrl+Shift+D', run: toggleDark },
    { icon: '📸', title: 'Capturar tela da página', hint: 'Ctrl+Shift+S', run: screenshot },
    { icon: '🔍', title: 'Zoom +', hint: 'Ctrl++', run: () => zoomBy(1) },
    { icon: '🔍', title: 'Zoom −', hint: 'Ctrl+-', run: () => zoomBy(-1) },
    { icon: '🔍', title: 'Zoom padrão (100%)', hint: 'Ctrl+0', run: () => t && setZoom(t, 1) },
    { icon: '🔗', title: 'Copiar endereço limpo (sem rastreadores)', run: () => { if (web) { api.copyText?.(cleanTracking(t.url)); toast('Link limpo copiado'); } } },
    { icon: '🔇', title: t && t.muted ? 'Ativar som da aba' : 'Silenciar aba', run: () => t && toggleMute(t) },
    { icon: '🛠️', title: 'Ferramentas do desenvolvedor', hint: 'F12', run: openDevTools },
    { icon: '🕘', title: 'Abrir histórico', hint: 'Ctrl+H', run: () => openPanel('history') },
    { icon: '📥', title: 'Abrir downloads', hint: 'Ctrl+J', run: () => openPanel('downloads') },
    { icon: '🔖', title: 'Abrir favoritos', hint: 'Ctrl+B', run: () => openPanel('bookmarks') },
    { icon: '⚙️', title: 'Abrir configurações', run: () => openPanel('settings') },
    { icon: '🛡️', title: settings.adblock ? 'Desligar bloqueador de anúncios' : 'Ligar bloqueador de anúncios', run: () => { settings.adblock = !settings.adblock; applySettings(); toast(settings.adblock ? 'Bloqueador ligado 🛡️' : 'Bloqueador desligado'); } },
    { icon: '🗑️', title: 'Limpar histórico', run: () => { if (confirm('Apagar todo o histórico?')) { history = []; store.set('history', []); toast('Histórico limpo'); } } }
  ];
  Object.entries(ENGINES).forEach(([k, v]) => cmds.push({ icon: '🔀', title: `Mecanismo de busca: ${v.name}`, run: () => { settings.engine = k; applySettings(); refreshHomes(); toast(`Agora buscando com ${v.name}`); } }));
  return cmds;
}

function cleanTracking(u) {
  try {
    const x = new URL(u);
    [...x.searchParams.keys()].forEach((k) => { if (/^(utm_|fbclid$|gclid$|mc_eid$|igshid$|ref_src$|yclid$|msclkid$)/i.test(k)) x.searchParams.delete(k); });
    return x.toString();
  } catch { return u; }
}

function renderPalette() {
  const q = paletteInput.value.trim().toLowerCase();
  const all = [
    ...getCommands(),
    ...[...tabs.values()].filter((t) => !t.isHome).map((t) => ({ icon: '🗂️', title: t.title || t.url, hint: 'Ir para a aba', run: () => switchTab(t.id) })),
    ...bookmarks.map((b) => ({ icon: '⭐', title: b.title, hint: b.url, run: () => navigate(activeTabId, b.url) }))
  ];
  const tokens = q.split(/\s+/).filter(Boolean);
  paletteItems = all.filter((c) => tokens.every((tk) => (c.title + ' ' + (c.hint || '')).toLowerCase().includes(tk))).slice(0, 12);
  paletteIdx = 0;
  paintPalette();
}

function paintPalette() {
  $('palette-list').replaceChildren(...paletteItems.map((c, i) => {
    const row = el('div', { className: 'sugg' + (i === paletteIdx ? ' sel' : '') }, el('span', { className: 's-icon', text: c.icon }), el('span', { className: 's-title', text: c.title }), el('span', { className: 's-sub', text: c.hint || '' }));
    row.addEventListener('click', () => runPalette(i));
    return row;
  }));
  if (!paletteItems.length) $('palette-list').append(el('div', { className: 'panel-empty', text: 'Nenhum comando encontrado.' }));
}

function runPalette(i) {
  const c = paletteItems[i];
  closePalette();
  if (c) setTimeout(() => c.run(), 0);
}

function openPalette() {
  palette.classList.add('visible');
  paletteInput.value = '';
  renderPalette();
  paletteInput.focus();
}
function closePalette() { palette.classList.remove('visible'); }

paletteInput.addEventListener('input', renderPalette);
paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); paletteIdx = (paletteIdx + 1) % Math.max(1, paletteItems.length); paintPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIdx = (paletteIdx - 1 + paletteItems.length) % Math.max(1, paletteItems.length); paintPalette(); }
  else if (e.key === 'Enter') runPalette(paletteIdx);
});
palette.addEventListener('mousedown', (e) => { if (e.target === palette) closePalette(); });

/* ═══════════════════════════ Atalhos (vindos do processo principal) ═══════════════════════════ */
function runShortcut(action) {
  const t = activeTab();
  if (action.startsWith('goto-tab:')) {
    const n = parseInt(action.split(':')[1], 10);
    const order = getOrder();
    return switchTab(n === 9 ? order[order.length - 1] : order[n - 1]);
  }
  switch (action) {
    case 'new-tab': return createTab();
    case 'close-tab': return closeTab(activeTabId);
    case 'reopen-tab': return reopenTab();
    case 'focus-url': urlBar.focus(); return urlBar.select();
    case 'reload': return reloadTab(t);
    case 'hard-reload': return reloadTab(t, true);
    case 'back': return $('btn-back').click();
    case 'forward': return $('btn-forward').click();
    case 'home': return t && goHome(t);
    case 'bookmark': return toggleBookmark();
    case 'find': return openFind();
    case 'history': return openPanel('history');
    case 'downloads': return openPanel('downloads');
    case 'bookmarks': return openPanel('bookmarks');
    case 'palette': return palette.classList.contains('visible') ? closePalette() : openPalette();
    case 'next-tab': return cycleTab(1);
    case 'prev-tab': return cycleTab(-1);
    case 'zoom-in': return zoomBy(1);
    case 'zoom-out': return zoomBy(-1);
    case 'zoom-reset': return t && !t.isHome && setZoom(t, 1);
    case 'devtools': return openDevTools();
    case 'screenshot': return screenshot();
    case 'dark-mode': return toggleDark();
    case 'escape':
      if (ctxMenu.classList.contains('visible')) return hideMenu();
      if (palette.classList.contains('visible')) return closePalette();
      if (suggBox.classList.contains('visible') || document.activeElement === urlBar) { hideSuggestions(); urlBar.blur(); return syncUrlBar(); }
      if (findBar.classList.contains('visible')) return closeFind();
      if (currentPanel) return closePanel();
      return;
  }
}
api.onShortcut?.(runShortcut);
api.onOpenInNewTab?.((url) => createTab(url, { after: activeTabId }));

/* ═══════════════════════════ Easter egg (Konami) ═══════════════════════════ */
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiPos = 0;
document.addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  konamiPos = k === KONAMI[konamiPos] ? konamiPos + 1 : (k === KONAMI[0] ? 1 : 0);
  if (konamiPos === KONAMI.length) {
    konamiPos = 0;
    const on = document.body.classList.toggle('rainbow');
    document.body.classList.toggle('dev', on);
    toast(on ? '🎮 Modo desenvolvedor secreto ATIVADO' : 'Modo secreto desativado');
    if (currentPanel === 'settings') renderPanel();
  }
});

/* ═══════════════════════════ Início ═══════════════════════════ */
window.addEventListener('beforeunload', () => saveSession());
window.addEventListener('resize', () => { if (currentPanel || findBar.classList.contains('visible')) positionOverlays(); });

applySettings();
renderBookmarksBar();

(function start() {
  const session = settings.restore ? store.get('session', null) : null;
  if (session && Array.isArray(session.tabs) && session.tabs.length) {
    const ids = session.tabs.map((s) => createTab(s.url, { pinned: s.pinned, lazy: true, background: true, title: s.title }));
    switchTab(ids[Math.min(Math.max(session.active || 0, 0), ids.length - 1)]);
  } else {
    createTab();
  }
})();