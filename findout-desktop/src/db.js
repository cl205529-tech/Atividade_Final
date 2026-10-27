'use strict';
const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (!pool) {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_CONNECT_TIMEOUT } = process.env;
    if (!DB_HOST || !DB_USER || !DB_NAME) {
      throw Object.assign(new Error('Variáveis do banco ausentes no .env'), { code: 'ENV_MISSING' });
    }
    pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT) || 3306,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: Number(DB_CONNECT_TIMEOUT) || 10000
    });
  }
  return pool;
}

async function colunaExiste(nome) {
  const [r] = await getPool().query('SHOW COLUMNS FROM pessoas LIKE ?', [nome]);
  return r.length > 0;
}

/** Cria a tabela (se não existir) e adiciona colunas novas em bancos já existentes. */
async function init() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS pessoas (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      nome          VARCHAR(100) NOT NULL,
      email         VARCHAR(150) NOT NULL,
      telefone      VARCHAR(20)  NULL,
      senha_hash    VARCHAR(255) NOT NULL,
      papel         ENUM('user','admin') NOT NULL DEFAULT 'user',
      ativo         TINYINT(1)   NOT NULL DEFAULT 1,
      ultimo_login  TIMESTAMP    NULL DEFAULT NULL,
      criado_em     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pessoas_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // Migração: tabela criada antes da área de admin
  if (!(await colunaExiste('papel')))
    await p.query("ALTER TABLE pessoas ADD COLUMN papel ENUM('user','admin') NOT NULL DEFAULT 'user' AFTER senha_hash");
  if (!(await colunaExiste('ativo')))
    await p.query('ALTER TABLE pessoas ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER papel');
  if (!(await colunaExiste('ultimo_login')))
    await p.query('ALTER TABLE pessoas ADD COLUMN ultimo_login TIMESTAMP NULL DEFAULT NULL AFTER ativo');
}


async function initDispositivos() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS dispositivos (
      codigo VARCHAR(64) NOT NULL,
      nome VARCHAR(100) NOT NULL,
      bateria INT NOT NULL DEFAULT 100,
      data_aquisicao DATE NOT NULL,
      versao VARCHAR(30) NOT NULL DEFAULT '1.0',
      icone VARCHAR(12) NOT NULL DEFAULT '🎒',
      PRIMARY KEY (codigo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // Mantém compatibilidade com uma tabela dispositivos criada anteriormente.
  const [cols] = await p.query('SHOW COLUMNS FROM dispositivos');
  if (!cols.some(c => c.Field === 'icone')) {
    await p.query("ALTER TABLE dispositivos ADD COLUMN icone VARCHAR(12) NOT NULL DEFAULT '🎒'");
  }
  const [rows] = await p.query('SELECT codigo FROM dispositivos LIMIT 1');
  if (!rows.length) {
    const defaults = [
      ['d1', 'Chaves', 87, '🔑', 'Sala de estar'],
      ['d2', 'Carteira', 64, '👛', 'Quarto'],
      ['d3', 'Óculos', 92, '👓', 'Cozinha']
    ];
    for (const [codigo, nome, bateria, icone] of defaults) {
      await p.query(
        'INSERT IGNORE INTO dispositivos (codigo,nome,bateria,data_aquisicao,versao,icone) VALUES (?,?,?,CURDATE(),?,?)',
        [codigo, nome, bateria, '1.0', icone]
      );
    }
  }
}
async function listarDispositivos() {
  const [rows] = await getPool().query('SELECT codigo,nome,bateria,data_aquisicao,versao,icone FROM dispositivos ORDER BY data_aquisicao,codigo');
  return rows.map(r => ({
    id: r.codigo, name: r.nome, battery: Number(r.bateria),
    lastSeen: r.data_aquisicao ? new Date(r.data_aquisicao).toLocaleDateString('pt-BR') : '—',
    icon: r.icone || '🎒', version: r.versao
  }));
}
async function adicionarDispositivo(d) {
  await getPool().query(
    'INSERT INTO dispositivos (codigo,nome,bateria,data_aquisicao,versao,icone) VALUES (?,?,100,CURDATE(),?,?)',
    [d.id, d.name, '1.0', d.icon || '🎒']
  );
  return listarDispositivos();
}
async function editarDispositivo(d) {
  const [r] = await getPool().query('UPDATE dispositivos SET nome=?, icone=? WHERE codigo=?', [d.name, d.icon || '🎒', d.id]);
  // affectedRows pode ser 0 quando o usuário salva os mesmos valores; isso não significa erro.
  if (!r.affectedRows) {
    const [rows] = await getPool().query('SELECT codigo FROM dispositivos WHERE codigo=? LIMIT 1', [d.id]);
    if (!rows.length) throw new Error('Dispositivo não encontrado.');
  }
  return listarDispositivos();
}
async function removerDispositivo(codigo) {
  await getPool().query('DELETE FROM dispositivos WHERE codigo=?', [codigo]);
  return listarDispositivos();
}

async function close() { if (pool) { await pool.end(); pool = null; } }

module.exports = { getPool, init, initDispositivos, listarDispositivos, adicionarDispositivo, editarDispositivo, removerDispositivo, close };
