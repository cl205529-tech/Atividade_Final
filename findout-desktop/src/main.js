'use strict';
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, shell, dialog } = require('electron');

/* ---------- .env (carregado antes de tudo) ---------- */
const dotenv = require('dotenv');
for (const f of [
  path.join(__dirname, '..', '.env'),                       // desenvolvimento
  path.join(app.getPath('userData'), '.env'),               // instalado (copie o .env para cá)
  path.join(process.resourcesPath || '', '.env')
]) {
  if (fs.existsSync(f)) { dotenv.config({ path: f }); break; }
}
const db = require('./db');
const pessoas = require('./pessoas');

const isDev = process.argv.includes('--dev');
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const DATA_FILE = () => path.join(app.getPath('userData'), 'findout-data.json');

const DEFAULT_DATA = {
  devices: [
    { id: 'd1', name: 'Chaves', icon: '🔑', battery: 87, lastSeen: 'Sala de estar' },
    { id: 'd2', name: 'Carteira', icon: '👛', battery: 64, lastSeen: 'Quarto' },
    { id: 'd3', name: 'Óculos', icon: '👓', battery: 92, lastSeen: 'Cozinha' }
  ],
  history: [],
  settings: { maxIntensity: 80, notifications: true, closeToTray: true, reduceMotion: false }
};

let win = null;
let tray = null;
let quitting = false;
let sessionId = null;   // id da pessoa logada (só o processo principal sabe)

/* ---------- Persistência simples em JSON (userData) ---------- */
function readData() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'));
    return { ...DEFAULT_DATA, ...raw, settings: { ...DEFAULT_DATA.settings, ...(raw.settings || {}) } };
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}
function writeData(data) {
  const tmp = DATA_FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE()); // escrita atômica
}

/* ---------- Janela ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0b1020',
    show: false,
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // Links externos abrem no navegador; navegação interna é bloqueada
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('maximize', () => win.webContents.send('win:state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('win:state', { maximized: false }));

  win.on('close', (e) => {
    if (!quitting && readData().settings.closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/* ---------- Bandeja do sistema ---------- */
function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('Find Out');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Find Out', click: showWindow },
    { label: 'Buscar objeto…', click: () => { showWindow(); win?.webContents.send('nav', 'track'); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWindow);
}

/* ---------- IPC ---------- */
function registerIpc() {
  ipcMain.handle('data:get', async () => ({ ...readData(), devices: await db.listarDispositivos().catch(() => readData().devices) }));
  ipcMain.handle('devices:list', () => db.listarDispositivos());
  ipcMain.handle('devices:add', (_e, d) => db.adicionarDispositivo(d));
  ipcMain.handle('devices:edit', (_e, d) => db.editarDispositivo(d));
  ipcMain.handle('devices:remove', (_e, id) => db.removerDispositivo(id));
  ipcMain.handle('data:set', (_e, data) => {
    if (!data || typeof data !== 'object' || !Array.isArray(data.devices)) return false;
    writeData({
      devices: data.devices.slice(0, 50),
      history: (data.history || []).slice(0, 200),
      settings: { ...DEFAULT_DATA.settings, ...(data.settings || {}) }
    });
    return true;
  });
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform
  }));
  ipcMain.on('notify', (_e, { title, body }) => {
    if (!Notification.isSupported() || !readData().settings.notifications) return;
    new Notification({ title: String(title).slice(0, 80), body: String(body).slice(0, 200), icon: ICON }).show();
  });
  /* ----- Autenticação + CRUD de pessoas (MySQL) ----- */
  const handle = (ch, fn) => ipcMain.handle(ch, async (_e, arg) => {
    try { return await fn(arg); } catch (err) { return { ok: false, error: pessoas.mensagemDeErro(err) }; }
  });
  const logado = () => { if (!sessionId) throw new pessoas.ValidationError('Sessão expirada. Entre novamente.'); return sessionId; };

  handle('auth:register', async (d) => { const u = await pessoas.criar(d); sessionId = u.id; return { ok: true, user: u }; });
  handle('auth:login',    async (d) => { const u = await pessoas.login(d); sessionId = u.id; return { ok: true, user: u }; });
  handle('auth:logout',   async () => { sessionId = null; return { ok: true }; });
  handle('auth:me',       async () => {
    const u = sessionId && await pessoas.buscar(sessionId);
    if (!u || !u.ativo) { sessionId = null; return { ok: false }; }
    return { ok: true, user: u };
  });
  handle('pessoa:update',   async (d) => ({ ok: true, user: await pessoas.atualizar(logado(), d) }));
  handle('pessoa:password', async (d) => { await pessoas.trocarSenha(logado(), d); return { ok: true }; });
  handle('pessoa:remove',   async (d) => { await pessoas.excluir(logado(), d); sessionId = null; return { ok: true }; });

  /* ----- Administração (cada chamada é revalidada no banco: papel = admin) ----- */
  handle('admin:list',     async () => ({ ok: true, users: await pessoas.admListar(logado()) }));
  handle('admin:create',   async (d) => ({ ok: true, user: await pessoas.admCriar(logado(), d) }));
  handle('admin:update',   async (d) => ({ ok: true, user: await pessoas.admAtualizar(logado(), d) }));
  handle('admin:status',   async (d) => { await pessoas.admStatus(logado(), d); return { ok: true }; });
  handle('admin:password', async (d) => { await pessoas.admSenha(logado(), d); return { ok: true }; });
  handle('admin:remove',   async (d) => { await pessoas.admExcluir(logado(), d); return { ok: true }; });
  handle('admin:export',   async () => {
    const users = await pessoas.admListar(logado());
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Exportar usuários',
      defaultPath: 'usuarios-findout.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (canceled || !filePath) return { ok: true, canceled: true };
    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;              // evita injeção de fórmula no Excel
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const head = ['ID', 'Nome', 'E-mail', 'Telefone', 'Perfil', 'Status', 'Cadastro', 'Último acesso'];
    const lines = [head.map(cell).join(';')].concat(users.map((u) => [
      u.id, u.nome, u.email, u.telefone, u.papel === 'admin' ? 'Administrador' : 'Usuário',
      u.ativo ? 'Ativo' : 'Bloqueado', u.criado_em, u.ultimo_login
    ].map(cell).join(';')));
    fs.writeFileSync(filePath, '\uFEFF' + lines.join('\r\n'));
    return { ok: true, count: users.length };
  });

  ipcMain.on('win:minimize', () => win?.minimize());
  ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('win:close', () => win?.close());
}

/* ---------- Ciclo de vida ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    registerIpc();
    db.init().then(() => db.initDispositivos()).then(() => pessoas.garantirAdmin()).then(() => console.log('[db] conectado, tabela e admin prontos'))
      .catch((e) => console.error('[db] falha ao iniciar:', e.code || e.message));
    createWindow();
    createTray();
    app.on('activate', showWindow);
  });
  app.on('before-quit', () => { quitting = true; db.close().catch(() => {}); });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && quitting) app.quit();
  });
}
