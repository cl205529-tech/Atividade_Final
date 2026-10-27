'use strict';
const crypto = require('crypto');
const { getPool } = require('./db');

/* ---------- Senhas (scrypt + salt, sem dependências nativas) ---------- */
const scrypt = (pw, salt) => new Promise((res, rej) =>
  crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));

async function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(senha, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function confereSenha(senha, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(senha, Buffer.from(saltHex, 'hex'));
  const exp = Buffer.from(keyHex, 'hex');
  return key.length === exp.length && crypto.timingSafeEqual(key, exp);
}

/* ---------- Validação ---------- */
class ValidationError extends Error {}
const bad = (m) => { throw new ValidationError(m); };
const str = (v) => (typeof v === 'string' ? v : '');

function limpaNome(v) {
  const n = str(v).trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 100) bad('Informe um nome entre 2 e 100 caracteres.');
  return n;
}
function limpaEmail(v) {
  const e = str(v).trim().toLowerCase();
  if (e.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) bad('E-mail inválido.');
  return e;
}
function limpaTelefone(v) {
  const t = str(v).trim();
  if (!t) return null;
  const d = t.replace(/\D/g, '');
  if (d.length < 8 || d.length > 15) bad('Telefone inválido.');
  return d;
}
function validaSenha(v) {
  const s = str(v);
  if (s.length < 8) bad('A senha deve ter pelo menos 8 caracteres.');
  if (s.length > 72) bad('A senha deve ter no máximo 72 caracteres.');
  return s;
}
function limpaPapel(v) {
  if (v !== 'user' && v !== 'admin') bad('Perfil inválido.');
  return v;
}
function limpaId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) bad('Usuário inválido.');
  return n;
}

const COLS = 'id, nome, email, telefone, papel, ativo, criado_em, ultimo_login';
const iso = (d) => (d ? new Date(d).toISOString() : null);
const publico = (r) => ({
  id: r.id, nome: r.nome, email: r.email, telefone: r.telefone,
  papel: r.papel, ativo: !!r.ativo,
  criado_em: iso(r.criado_em), ultimo_login: iso(r.ultimo_login)
});

/* ---------- CRUD do próprio usuário ---------- */
async function criar(d = {}, papel = 'user') {                   // CREATE
  const nome = limpaNome(d.nome), email = limpaEmail(d.email);
  const telefone = limpaTelefone(d.telefone), senha = validaSenha(d.senha);
  const [r] = await getPool().execute(
    'INSERT INTO pessoas (nome, email, telefone, senha_hash, papel) VALUES (?, ?, ?, ?, ?)',
    [nome, email, telefone, await hashSenha(senha), papel]);
  return buscar(r.insertId);
}

async function buscar(id) {                                      // READ
  const [rows] = await getPool().execute(`SELECT ${COLS} FROM pessoas WHERE id = ?`, [id]);
  return rows[0] ? publico(rows[0]) : null;
}

async function login(d = {}) {                                   // READ (autenticação)
  const email = str(d.email).trim().toLowerCase(), senha = str(d.senha);
  const [rows] = await getPool().execute('SELECT * FROM pessoas WHERE email = ?', [email]);
  const ok = rows[0] && await confereSenha(senha, rows[0].senha_hash);
  if (!ok) bad('E-mail ou senha incorretos.');
  if (!rows[0].ativo) bad('Esta conta está bloqueada. Fale com o administrador.');
  await getPool().execute('UPDATE pessoas SET ultimo_login = NOW() WHERE id = ?', [rows[0].id]);
  return buscar(rows[0].id);
}

async function atualizar(id, d = {}) {                           // UPDATE (não altera perfil)
  const nome = limpaNome(d.nome), email = limpaEmail(d.email), telefone = limpaTelefone(d.telefone);
  await getPool().execute(
    'UPDATE pessoas SET nome = ?, email = ?, telefone = ? WHERE id = ?', [nome, email, telefone, id]);
  return buscar(id);
}

async function trocarSenha(id, d = {}) {                         // UPDATE (senha)
  const nova = validaSenha(d.nova);
  const [rows] = await getPool().execute('SELECT senha_hash FROM pessoas WHERE id = ?', [id]);
  if (!rows[0] || !(await confereSenha(str(d.atual), rows[0].senha_hash))) bad('Senha atual incorreta.');
  await getPool().execute('UPDATE pessoas SET senha_hash = ? WHERE id = ?', [await hashSenha(nova), id]);
}

async function excluir(id, d = {}) {                             // DELETE
  const [rows] = await getPool().execute('SELECT senha_hash, papel FROM pessoas WHERE id = ?', [id]);
  if (!rows[0] || !(await confereSenha(str(d.senha), rows[0].senha_hash))) bad('Senha incorreta.');
  if (rows[0].papel === 'admin') bad('A conta de administrador não pode ser excluída por aqui.');
  await getPool().execute('DELETE FROM pessoas WHERE id = ?', [id]);
}

/* ---------- Administração ---------- */
/** Cria (ou promove) a conta admin definida no .env. A senha só é definida na criação. */
async function garantirAdmin() {
  const email = limpaEmail(process.env.ADMIN_EMAIL || 'admin@findout.com');
  const [rows] = await getPool().execute('SELECT id, papel, ativo FROM pessoas WHERE email = ?', [email]);
  if (!rows[0]) {
    const senha = validaSenha(process.env.ADMIN_PASSWORD || '12345678');
    await getPool().execute(
      'INSERT INTO pessoas (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)',
      [limpaNome(process.env.ADMIN_NAME || 'Administrador'), email, await hashSenha(senha), 'admin']);
    console.log('[admin] conta de administrador criada:', email);
  } else if (rows[0].papel !== 'admin' || !rows[0].ativo) {
    await getPool().execute("UPDATE pessoas SET papel = 'admin', ativo = 1 WHERE id = ?", [rows[0].id]);
  }
}

async function exigeAdmin(adminId) {
  const u = await buscar(adminId);
  if (!u || u.papel !== 'admin' || !u.ativo) bad('Acesso restrito ao administrador.');
}
async function existe(id) { if (!(await buscar(id))) bad('Usuário não encontrado.'); }

async function admListar(adminId) {
  await exigeAdmin(adminId);
  const [rows] = await getPool().execute(
    `SELECT ${COLS} FROM pessoas ORDER BY criado_em DESC, id DESC LIMIT 1000`);
  return rows.map(publico);
}

async function admCriar(adminId, d = {}) {
  await exigeAdmin(adminId);
  return criar(d, limpaPapel(d.papel || 'user'));
}

async function admAtualizar(adminId, d = {}) {
  await exigeAdmin(adminId);
  const id = limpaId(d.id);
  const nome = limpaNome(d.nome), email = limpaEmail(d.email);
  const telefone = limpaTelefone(d.telefone), papel = limpaPapel(d.papel);
  if (id === adminId && papel !== 'admin') bad('Você não pode remover seu próprio acesso de administrador.');
  await existe(id);
  await getPool().execute(
    'UPDATE pessoas SET nome = ?, email = ?, telefone = ?, papel = ? WHERE id = ?',
    [nome, email, telefone, papel, id]);
  return buscar(id);
}

async function admStatus(adminId, d = {}) {
  await exigeAdmin(adminId);
  const id = limpaId(d.id), ativo = d.ativo ? 1 : 0;
  if (id === adminId && !ativo) bad('Você não pode bloquear a si mesmo.');
  await existe(id);
  await getPool().execute('UPDATE pessoas SET ativo = ? WHERE id = ?', [ativo, id]);
}

async function admSenha(adminId, d = {}) {
  await exigeAdmin(adminId);
  const id = limpaId(d.id), nova = validaSenha(d.nova);
  await existe(id);
  await getPool().execute('UPDATE pessoas SET senha_hash = ? WHERE id = ?', [await hashSenha(nova), id]);
}

async function admExcluir(adminId, d = {}) {
  await exigeAdmin(adminId);
  const id = limpaId(d.id);
  if (id === adminId) bad('Você não pode excluir a própria conta de administrador.');
  await existe(id);
  await getPool().execute('DELETE FROM pessoas WHERE id = ?', [id]);
}

/** Converte erros técnicos em mensagens amigáveis (o detalhe vai só para o console). */
function mensagemDeErro(err) {
  if (err instanceof ValidationError) return err.message;
  console.error('[db]', err.code || '', err.message);
  switch (err.code) {
    case 'ER_DUP_ENTRY': return 'Este e-mail já está cadastrado.';
    case 'ER_ACCESS_DENIED_ERROR': return 'Banco de dados recusou o usuário/senha. Verifique o .env.';
    case 'ER_BAD_DB_ERROR': return 'Banco de dados não encontrado. Verifique DB_NAME no .env.';
    case 'ENV_MISSING': return err.message;
    case 'ECONNREFUSED': case 'ETIMEDOUT': case 'ENOTFOUND': case 'EHOSTUNREACH':
    case 'PROTOCOL_CONNECTION_LOST':
      return 'Não foi possível conectar ao servidor MySQL. Verifique a internet/VPN da escola.';
    default: return 'Erro inesperado ao acessar o banco de dados.';
  }
}

module.exports = {
  ValidationError, criar, buscar, login, atualizar, trocarSenha, excluir, mensagemDeErro,
  garantirAdmin, admListar, admCriar, admAtualizar, admStatus, admSenha, admExcluir
};
