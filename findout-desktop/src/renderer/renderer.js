'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const MAX_DIST = 20;       // metros
const TOUCH_DIST = 0.3;    // distância para confirmar por toque

let state = { devices: [], history: [], settings: {} };
let search = null;          // { device, timer, auto }
let saveTimer = null;

/* ---------- Persistência ---------- */
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.findout.setData(state), 200);
}

/* ---------- Utilidades ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 3000);
}
const fmtDate = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- Navegação ---------- */
function go(view) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  $$('.nav').forEach((n) => n.classList.toggle('active', n.dataset.nav === view));
  if (view === 'track') renderTrackSelect();
  if (view === 'report') renderSalesReport();
  if (view === 'admin') { if (!isAdmin()) return go('home'); admLoad(); }
}
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) go(nav.dataset.nav);
});

/* ---------- Barra de título ---------- */
$('#wMin').onclick = () => window.findout.win.minimize();
$('#wMax').onclick = () => window.findout.win.maximize();
$('#wClose').onclick = () => window.findout.win.close();

/* ---------- Dispositivos ---------- */
function renderDevices() {
  const grid = $('#devGrid');
  grid.replaceChildren();
  if (!state.devices.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Nenhuma tag cadastrada. Clique em “Adicionar tag”.';
    grid.append(p);
    return;
  }
  for (const d of state.devices) {
    const card = document.createElement('article');
    card.className = 'card dev';
    const mk = (cls, txt) => { const el = document.createElement('div'); el.className = cls; el.textContent = txt; return el; };
    const acts = document.createElement('div');
    acts.className = 'acts';
    const find = document.createElement('button');
    find.className = 'btn btn-primary btn-sm';
    find.textContent = 'Buscar';
    find.onclick = () => { go('track'); $('#trackDevice').value = d.id; };
    const del = document.createElement('button');
    del.className = 'btn btn-danger btn-sm';
    del.textContent = 'Remover';
    del.onclick = async () => {
      try {
        state.devices = await window.findout.devices.remove(d.id);
        save(); renderDevices(); renderTrackSelect(); toast(`“${d.name}” removido.`);
      } catch (err) { toast('Não foi possível remover o dispositivo.'); }
    };
    const edit = document.createElement('button');
    edit.className = 'btn btn-ghost btn-sm';
    edit.textContent = 'Editar';
    edit.onclick = () => openModal({
      title: `Editar dispositivo: ${d.name}`,
      fields: [
        { name: 'name', label: 'Nome do dispositivo', value: d.name, required: true, maxLength: 100 },
        { name: 'icon', label: 'Ícone', value: d.icon || '🎒', options: [['🎒','🎒 Mochila'],['🔑','🔑 Chaves'],['👛','👛 Carteira'],['👓','👓 Óculos'],['📱','📱 Celular'],['🎧','🎧 Fones'],['🧥','🧥 Casaco'],['🐶','🐶 Pet']] }
      ],
      onSubmit: async (values) => {
        const name = values.name.trim();
        if (!name) return { ok: false, error: 'Informe um nome válido.' };
        try {
          state.devices = await window.findout.devices.edit({ id: d.id, name, icon: values.icon || '🎒' });
          save(); renderDevices(); renderTrackSelect(); renderSalesReport();
          toast('Dispositivo atualizado.');
          return { ok: true };
        } catch (err) {
          return { ok: false, error: err?.message || 'Não foi possível editar o dispositivo. Verifique a conexão com o banco.' };
        }
      }
    });
    acts.append(find, edit, del);
    card.append(
      mk('ico', d.icon), mk('nm', d.name),
      mk('meta', `Bateria ${d.battery}% · Visto: ${d.lastSeen}`),
      acts
    );
    grid.append(card);
  }
}

$('#btnAdd').onclick = () => { $('#addForm').hidden = false; $('#newName').focus(); };
$('#btnCancelAdd').onclick = () => { $('#addForm').hidden = true; $('#addForm').reset(); };
$('#addForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('#newName').value.trim();
  if (!name) return;
  try {
    state.devices = await window.findout.devices.add({ id: uid(), name, icon: $('#newIcon').value });
    save(); renderDevices(); renderTrackSelect();
    $('#addForm').reset(); $('#addForm').hidden = true;
    toast(`“${name}” adicionado.`);
  } catch (err) { toast('Não foi possível salvar no banco de dados. Verifique a conexão.'); }
};

/* ---------- Histórico ---------- */
function renderHistory() {
  const ul = $('#histList');
  ul.replaceChildren();
  if (!state.history.length) {
    const li = document.createElement('p');
    li.className = 'empty';
    li.textContent = 'Nenhuma busca concluída ainda.';
    ul.append(li);
    return;
  }
  for (const h of state.history) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = `${h.icon} ${h.name} encontrado em ${h.seconds}s`;
    const b = document.createElement('span');
    b.className = 'when';
    b.textContent = fmtDate(h.date);
    li.append(a, b);
    ul.append(li);
  }
}
$('#btnClearHist').onclick = () => { state.history = []; save(); renderHistory(); renderSalesReport(); };

/* ---------- Rastreamento ---------- */
function renderTrackSelect() {
  const sel = $('#trackDevice');
  const prev = sel.value;
  sel.replaceChildren();
  for (const d of state.devices) {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = `${d.icon} ${d.name}`;
    sel.append(o);
  }
  if (prev) sel.value = prev;
  $('#btnStart').disabled = !state.devices.length || !!search;
}

/** Atualiza a interface de acordo com a distância (0–20 m). */
function applyDistance(d) {
  d = Math.max(0, Math.min(MAX_DIST, d));
  $('#distRange').value = d;
  $('#distLabel').textContent = d.toFixed(1);
  $('#distVal').textContent = d.toFixed(1);

  const cap = state.settings.maxIntensity / 100;
  const raw = 1 - d / MAX_DIST;                 // 0 (longe) → 1 (perto)
  const intensity = Math.round(raw * cap * 100);
  $('#intBar').style.width = intensity + '%';
  $('#intText').textContent = `Vibração ${intensity}%`;

  const wrist = $('#wrist'), radar = $('#trackRadar');
  const buzz = d < MAX_DIST - 0.5;
  wrist.classList.toggle('buzz', buzz);
  wrist.style.setProperty('--shake', (1 + raw * cap * 7).toFixed(1) + 'px');
  wrist.style.setProperty('--buzz', (0.6 - raw * 0.5).toFixed(2) + 's'); // mais perto = mais rápido
  radar.style.setProperty('--pulse', (2.4 - raw * 2).toFixed(2) + 's');

  const near = d <= TOUCH_DIST;
  $('#btnTouch').hidden = !near;
  $('#trackStatus').textContent =
    near ? 'Está aqui! Encoste a tag na pulseira para confirmar.' :
    d < 1.5 ? 'Muito perto — quase lá!' :
    d < 5 ? 'Esquentando… continue nessa direção.' :
    d < 12 ? 'Sinal fraco. Continue procurando.' : 'Longe. Comece a se movimentar.';
}

function startSearch() {
  const device = state.devices.find((x) => x.id === $('#trackDevice').value);
  if (!device) return;
  search = { device, startedAt: Date.now(), timer: null };
  $('#trackRadar').classList.add('live');
  $('#distRange').disabled = false;
  $('#btnAuto').disabled = false;
  $('#btnStop').disabled = false;
  $('#btnStart').disabled = true;
  $('#trackDevice').disabled = true;
  applyDistance(8 + Math.random() * 10);
  toast(`Buscando “${device.name}”…`);
}

function stopSearch() {
  if (!search) return;
  clearInterval(search.timer);
  search = null;
  $('#trackRadar').classList.remove('live');
  $('#wrist').classList.remove('buzz');
  $('#distRange').disabled = true;
  $('#btnAuto').disabled = true;
  $('#btnAuto').textContent = 'Caminhar';
  $('#btnStop').disabled = true;
  $('#btnStart').disabled = !state.devices.length;
  $('#trackDevice').disabled = false;
  $('#btnTouch').hidden = true;
  $('#distVal').textContent = '—';
  $('#intBar').style.width = '0';
  $('#intText').textContent = 'Vibração 0%';
  $('#trackStatus').textContent = 'Selecione um objeto e inicie a busca.';
}

function toggleAuto() {
  if (!search) return;
  if (search.timer) {
    clearInterval(search.timer);
    search.timer = null;
    $('#btnAuto').textContent = 'Caminhar';
    return;
  }
  $('#btnAuto').textContent = 'Pausar';
  search.timer = setInterval(() => {
    const cur = parseFloat($('#distRange').value);
    const next = cur - (0.15 + Math.random() * 0.15);
    applyDistance(next);
    if (next <= TOUCH_DIST) { clearInterval(search.timer); search.timer = null; $('#btnAuto').textContent = 'Caminhar'; }
  }, 200);
}

function confirmTouch() {
  if (!search) return;
  const { device, startedAt } = search;
  const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  state.history.unshift({ name: device.name, icon: device.icon, seconds, date: new Date().toISOString() });
  state.history = state.history.slice(0, 200);
  const dv = state.devices.find((x) => x.id === device.id);
  if (dv) dv.lastSeen = 'Agora mesmo';
  save(); renderHistory(); renderDevices(); renderSalesReport();
  window.findout.notify('Objeto encontrado!', `“${device.name}” localizado em ${seconds}s.`);
  toast(`✔ “${device.name}” encontrado!`);
  stopSearch();
}

$('#btnStart').onclick = startSearch;
$('#btnStop').onclick = stopSearch;
$('#btnAuto').onclick = toggleAuto;
$('#btnTouch').onclick = confirmTouch;
$('#distRange').oninput = (e) => {
  if (search?.timer) { clearInterval(search.timer); search.timer = null; $('#btnAuto').textContent = 'Caminhar'; }
  applyDistance(parseFloat(e.target.value));
};

/* ---------- Configurações ---------- */
function applySettings() {
  const s = state.settings;
  $('#setIntensity').value = s.maxIntensity;
  $('#setIntLabel').textContent = s.maxIntensity;
  $('#setNotif').checked = s.notifications;
  $('#setTray').checked = s.closeToTray;
  $('#setMotion').checked = s.reduceMotion;
  document.body.classList.toggle('reduce-motion', s.reduceMotion);
}
$('#setIntensity').oninput = (e) => {
  state.settings.maxIntensity = +e.target.value;
  $('#setIntLabel').textContent = e.target.value;
  save();
};
$('#setNotif').onchange = (e) => { state.settings.notifications = e.target.checked; save(); };
$('#setTray').onchange = (e) => { state.settings.closeToTray = e.target.checked; save(); };
$('#setMotion').onchange = (e) => { state.settings.reduceMotion = e.target.checked; applySettings(); save(); };

/* ---------- Autenticação e conta (MySQL) ---------- */
let user = null;

function setMsg(sel, msg, ok = false) {
  const el = $(sel);
  el.textContent = msg || '';
  el.classList.toggle('ok', ok);
  el.hidden = !msg;
}

function renderAccount() {
  if (!user) return;
  $('#accNome').value = user.nome;
  $('#accEmail').value = user.email;
  $('#accTel').value = user.telefone || '';
  $('#accSince').textContent = user.criado_em ? 'Conta criada em ' + fmtDate(user.criado_em) : '';
  $('#whoami').textContent = user.nome.split(' ')[0];
}

function enterApp(u) {
  user = u;
  $('#auth').hidden = true;
  $('#navAdmin').hidden = !isAdmin();
  renderAccount();
  go(isAdmin() ? 'admin' : 'home');
}

function leaveApp() {
  user = null;
  admUsers = [];
  $('#navAdmin').hidden = true;
  closeModal();
  stopSearch();
  $$('form').forEach((f) => f.reset());
  setMsg('#authErr', '');
  $('#auth').hidden = false;
  $('#logEmail').focus();
}

$$('[data-auth-tab]').forEach((b) => {
  b.onclick = () => {
    const reg = b.dataset.authTab === 'reg';
    $$('[data-auth-tab]').forEach((x) => x.classList.toggle('active', x === b));
    $('#loginForm').hidden = reg;
    $('#regForm').hidden = !reg;
    setMsg('#authErr', '');
  };
});

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  setMsg('#authErr', '');
  const r = await window.findout.auth.login({ email: $('#logEmail').value, senha: $('#logSenha').value });
  if (!r.ok) return setMsg('#authErr', r.error);
  $('#loginForm').reset();
  enterApp(r.user);
};

$('#regForm').onsubmit = async (e) => {
  e.preventDefault();
  setMsg('#authErr', '');
  if ($('#regSenha').value !== $('#regSenha2').value) return setMsg('#authErr', 'As senhas não coincidem.');
  const r = await window.findout.auth.register({
    nome: $('#regNome').value, email: $('#regEmail').value,
    telefone: $('#regTel').value, senha: $('#regSenha').value
  });
  if (!r.ok) return setMsg('#authErr', r.error);
  $('#regForm').reset();
  enterApp(r.user);
  toast('Conta criada! Bem-vindo(a).');
};

$('#accForm').onsubmit = async (e) => {
  e.preventDefault();
  const r = await window.findout.pessoa.update({
    nome: $('#accNome').value, email: $('#accEmail').value, telefone: $('#accTel').value
  });
  if (!r.ok) return setMsg('#accMsg', r.error);
  user = r.user; renderAccount();
  setMsg('#accMsg', 'Dados atualizados.', true);
};

$('#pwForm').onsubmit = async (e) => {
  e.preventDefault();
  const r = await window.findout.pessoa.changePassword({ atual: $('#pwOld').value, nova: $('#pwNew').value });
  if (!r.ok) return setMsg('#pwMsg', r.error);
  $('#pwForm').reset();
  setMsg('#pwMsg', 'Senha alterada.', true);
};

$('#delForm').onsubmit = async (e) => {
  e.preventDefault();
  if (!confirm('Excluir sua conta definitivamente?')) return;
  const r = await window.findout.pessoa.remove({ senha: $('#delPw').value });
  if (!r.ok) return setMsg('#delMsg', r.error);
  leaveApp();
  toast('Conta excluída.');
};

$('#btnLogout').onclick = async () => { await window.findout.auth.logout(); leaveApp(); };

/* ---------- Administração ---------- */
const isAdmin = () => user?.papel === 'admin';
let admUsers = [];
let modalSubmit = null, modalFields = [];

const fmtTel = (t) => {
  if (!t) return '—';
  const d = t.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
};
const fmtOpt = (iso) => (iso ? fmtDate(iso) : '—');

/* Modal genérico (criar / editar / redefinir senha) */
function openModal({ title, okText = 'Salvar', fields, onSubmit }) {
  $('#modalTitle').textContent = title;
  $('#modalOk').textContent = okText;
  setMsg('#modalErr', '');
  const box = $('#modalFields');
  box.replaceChildren();
  modalFields = fields;
  modalSubmit = onSubmit;
  fields.forEach((f, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('label');
    lab.htmlFor = 'mf' + i;
    lab.textContent = f.label;
    let el;
    if (f.options) {
      el = document.createElement('select');
      for (const [v, t] of f.options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = t; el.append(o);
      }
    } else {
      el = document.createElement('input');
      el.type = f.type || 'text';
      if (f.maxLength) el.maxLength = f.maxLength;
      if (f.minLength) el.minLength = f.minLength;
      if (f.autocomplete) el.autocomplete = f.autocomplete;
    }
    el.id = 'mf' + i;
    el.value = f.value ?? '';
    el.required = !!f.required;
    el.disabled = !!f.disabled;
    wrap.append(lab, el);
    box.append(wrap);
  });
  $('#modal').hidden = false;
  box.querySelector('input:not(:disabled), select:not(:disabled)')?.focus();
}
function closeModal() {
  $('#modal').hidden = true;
  modalSubmit = null;
  $('#modalFields').replaceChildren();
}
$('#modalCancel').onclick = closeModal;
$('#modalForm').onsubmit = async (e) => {
  e.preventDefault();
  if (!modalSubmit) return;
  const v = {};
  modalFields.forEach((f, i) => { v[f.name] = $('#mf' + i).value; });
  setMsg('#modalErr', '');
  const r = await modalSubmit(v);
  if (!r.ok) return setMsg('#modalErr', r.error);
  closeModal();
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

/* Lista */
async function admLoad() {
  const r = await window.findout.admin.list();
  if (!r.ok) return setMsg('#admMsg', r.error);
  setMsg('#admMsg', '');
  admUsers = r.users;
  admRender();
}

function admRender() {
  const week = Date.now() - 7 * 864e5;
  $('#statTotal').textContent = admUsers.length;
  $('#statAdmins').textContent = admUsers.filter((u) => u.papel === 'admin').length;
  $('#statBlocked').textContent = admUsers.filter((u) => !u.ativo).length;
  $('#statNew').textContent = admUsers.filter((u) => new Date(u.criado_em).getTime() >= week).length;

  const q = $('#admSearch').value.trim().toLowerCase();
  const f = $('#admFilter').value;
  const list = admUsers.filter((u) => {
    if (f === 'user' && u.papel !== 'user') return false;
    if (f === 'admin' && u.papel !== 'admin') return false;
    if (f === 'blocked' && u.ativo) return false;
    return !q || [u.nome, u.email, u.telefone || ''].some((x) => x.toLowerCase().includes(q));
  });

  const body = $('#admBody');
  body.replaceChildren();
  for (const u of list) {
    const tr = document.createElement('tr');
    const td = (txt) => { const c = document.createElement('td'); c.textContent = txt; tr.append(c); return c; };
    const badge = (txt, cls) => { const b = document.createElement('span'); b.className = 'badge ' + cls; b.textContent = txt; return b; };
    const self = u.id === user.id;

    td(u.id);
    td(u.nome + (self ? ' (você)' : ''));
    td(u.email);
    td(fmtTel(u.telefone));
    td('').append(u.papel === 'admin' ? badge('Admin', 'b-admin') : badge('Usuário', 'b-user'));
    td('').append(u.ativo ? badge('Ativo', 'b-ok') : badge('Bloqueado', 'b-off'));
    td(fmtOpt(u.criado_em));
    td(fmtOpt(u.ultimo_login));

    const acts = document.createElement('div');
    acts.className = 'acts';
    const mk = (txt, cls, fn, disabled = false) => {
      const b = document.createElement('button');
      b.className = 'btn btn-sm ' + cls;
      b.textContent = txt; b.disabled = disabled; b.onclick = fn;
      acts.append(b);
    };
    mk('Editar', 'btn-ghost', () => admEdit(u));
    mk('Senha', 'btn-ghost', () => admPassword(u));
    mk(u.ativo ? 'Bloquear' : 'Desbloquear', 'btn-ghost', () => admToggle(u), self);
    mk('Excluir', 'btn-danger', () => admDelete(u), self);
    td('').append(acts);
    body.append(tr);
  }
  if (!list.length) {
    const tr = document.createElement('tr');
    const c = document.createElement('td');
    c.colSpan = 9; c.className = 'empty-cell';
    c.textContent = 'Nenhum usuário encontrado.';
    tr.append(c); body.append(tr);
  }
  $('#admCount').textContent = `${list.length} de ${admUsers.length} usuário(s)`;
}

/* Ações */
async function admRun(promise, okMsg) {
  const r = await promise;
  if (!r.ok) { setMsg('#admMsg', r.error); return r; }
  setMsg('#admMsg', '');
  toast(okMsg);
  await admLoad();
  return r;
}

function admEdit(u) {
  openModal({
    title: `Editar usuário #${u.id}`,
    fields: [
      { name: 'nome', label: 'Nome', value: u.nome, required: true, maxLength: 100 },
      { name: 'email', label: 'E-mail', type: 'email', value: u.email, required: true, maxLength: 150 },
      { name: 'telefone', label: 'Telefone', type: 'tel', value: u.telefone || '', maxLength: 20 },
      { name: 'papel', label: 'Perfil', value: u.papel, disabled: u.id === user.id,
        options: [['user', 'Usuário'], ['admin', 'Administrador']] }
    ],
    onSubmit: async (v) => {
      const r = await window.findout.admin.update({ ...v, id: u.id });
      if (r.ok) { toast('Usuário atualizado.'); await admLoad(); if (u.id === user.id) { user = r.user; renderAccount(); } }
      return r;
    }
  });
}

function admPassword(u) {
  openModal({
    title: `Redefinir senha de ${u.nome}`,
    okText: 'Redefinir',
    fields: [{ name: 'nova', label: 'Nova senha (mín. 8 caracteres)', type: 'password', required: true, minLength: 8, maxLength: 72, autocomplete: 'new-password' }],
    onSubmit: async (v) => {
      const r = await window.findout.admin.resetPassword({ id: u.id, nova: v.nova });
      if (r.ok) toast('Senha redefinida.');
      return r;
    }
  });
}

function admToggle(u) {
  const acao = u.ativo ? 'bloquear' : 'desbloquear';
  if (!confirm(`Deseja ${acao} ${u.nome}?`)) return;
  admRun(window.findout.admin.setStatus({ id: u.id, ativo: !u.ativo }), u.ativo ? 'Usuário bloqueado.' : 'Usuário desbloqueado.');
}

function admDelete(u) {
  if (!confirm(`Excluir ${u.nome} (${u.email}) definitivamente?`)) return;
  admRun(window.findout.admin.remove({ id: u.id }), 'Usuário excluído.');
}

$('#admNew').onclick = () => openModal({
  title: 'Novo usuário',
  okText: 'Criar',
  fields: [
    { name: 'nome', label: 'Nome', required: true, maxLength: 100 },
    { name: 'email', label: 'E-mail', type: 'email', required: true, maxLength: 150 },
    { name: 'telefone', label: 'Telefone (opcional)', type: 'tel', maxLength: 20 },
    { name: 'senha', label: 'Senha (mín. 8 caracteres)', type: 'password', required: true, minLength: 8, maxLength: 72, autocomplete: 'new-password' },
    { name: 'papel', label: 'Perfil', value: 'user', options: [['user', 'Usuário'], ['admin', 'Administrador']] }
  ],
  onSubmit: async (v) => {
    const r = await window.findout.admin.create(v);
    if (r.ok) { toast('Usuário criado.'); await admLoad(); }
    return r;
  }
});

$('#admExport').onclick = async () => {
  const r = await window.findout.admin.exportCsv();
  if (!r.ok) return setMsg('#admMsg', r.error);
  if (!r.canceled) toast(`${r.count} usuário(s) exportado(s).`);
};
$('#admRefresh').onclick = admLoad;
$('#admSearch').oninput = admRender;
$('#admFilter').onchange = admRender;


function renderSalesReport() {
  const period = $('#reportPeriod')?.value || 'all';
  const now = Date.now();
  const history = (state.history || []).filter(h => {
    if (period === 'all') return true;
    const days = Number(period);
    const t = new Date(h.date).getTime();
    return Number.isFinite(t) && now - t <= days * 86400000 && now >= t;
  });
  $('#reportTotal').textContent = history.length;
  const canvas = $('#salesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth || 600, h = 240, dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const counts = new Map();
  history.forEach(item => {
    const date = new Date(item.date);
    if (!Number.isNaN(date.getTime())) {
      const key = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  });
  const entries = [...counts.entries()].slice(-8);
  const max = Math.max(1, ...entries.map(x => x[1]));
  const left = 36, bottom = 205, chartH = 165, chartW = Math.max(100, w - left - 16);
  ctx.font = '12px sans-serif'; ctx.fillStyle = '#8d98b8'; ctx.strokeStyle = '#34405e';
  for (let i = 0; i <= 4; i++) {
    const y = bottom - chartH * i / 4;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - 10, y); ctx.stroke();
    ctx.fillText(String(Math.round(max * i / 4)), 4, y + 4);
  }
  if (!entries.length) {
    ctx.fillStyle = '#8d98b8'; ctx.fillText('Nenhum registro no período selecionado.', left + 8, 100); return;
  }
  const slot = chartW / entries.length, barW = Math.min(42, slot * .58);
  entries.forEach(([label, value], i) => {
    const bh = chartH * value / max, x = left + slot * i + (slot - barW) / 2;
    ctx.fillStyle = '#7c8cff'; ctx.fillRect(x, bottom - bh, barW, bh);
    ctx.fillStyle = '#e8ecff'; ctx.textAlign = 'center'; ctx.fillText(String(value), x + barW / 2, bottom - bh - 7);
    ctx.fillStyle = '#8d98b8'; ctx.fillText(label, x + barW / 2, bottom + 18);
  });
  ctx.textAlign = 'start';
}
$('#reportPeriod').onchange = renderSalesReport;

// Gera registros de demonstração para testar o relatório sem precisar concluir buscas reais.
$('#btnSimulateReport').onclick = () => {
  const icons = ['🔑', '👛', '👓', '📱', '🎧', '🎒'];
  const names = ['Chaves', 'Carteira', 'Óculos', 'Celular', 'Fones', 'Mochila'];
  const now = Date.now();
  const generated = [];
  // Inclui dados dos últimos dias para testar os filtros de 7 e 30 dias,
  // além de registros distribuídos pelos meses anteriores para o gráfico mensal.
  for (let i = 0; i < 30; i++) {
    const daysAgo = i < 9 ? Math.floor(i / 3) : 10 + Math.floor(Math.random() * 170);
    const deviceIndex = Math.floor(Math.random() * names.length);
    generated.push({
      name: `[SIMULAÇÃO] ${names[deviceIndex]}`,
      icon: icons[deviceIndex],
      seconds: 8 + Math.floor(Math.random() * 100),
      date: new Date(now - daysAgo * 86400000 - Math.floor(Math.random() * 86400000)).toISOString(),
      simulated: true
    });
  }
  state.history = [...generated, ...(state.history || [])].slice(0, 200);
  save();
  renderHistory();
  renderSalesReport();
  toast('30 registros simulados adicionados ao relatório.');
};

/* ---------- Inicialização ---------- */
(async function init() {
  state = await window.findout.getData();
  const info = await window.findout.info();
  $('#appInfo').textContent = `v${info.version} · Electron ${info.electron}`;
  applySettings(); renderDevices(); renderHistory(); renderTrackSelect(); renderSalesReport();
  window.findout.onNavigate((v) => { if (user) go(v); });
  const me = await window.findout.auth.me();
  if (me.ok) enterApp(me.user); else $('#auth').hidden = false;
})();
