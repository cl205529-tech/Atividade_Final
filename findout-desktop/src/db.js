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

async function close() { if (pool) { await pool.end(); pool = null; } }

module.exports = { getPool, init, close };
