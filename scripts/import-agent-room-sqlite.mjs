#!/usr/bin/env node
/**
 * Importa os dados historicos do Agent Room (data/app.sqlite, better-sqlite3
 * direto — legado pre-ORM) para as tabelas agent_* do database.db (Svelar).
 *
 * Idempotente: pula registros cujo id ja existe no destino.
 *
 * Uso: npm run migrate:agent-room-data
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const legacyPath = resolve('data', 'app.sqlite');
const targetPath = resolve('database.db');

if (!existsSync(legacyPath)) {
  console.log('Nenhum data/app.sqlite encontrado — nada a importar.');
  process.exit(0);
}

const legacy = new Database(legacyPath, { readonly: true });
const target = new Database(targetPath);

const tables = [
  { from: 'conversations', to: 'agent_conversations' },
  { from: 'messages', to: 'agent_messages' },
  { from: 'agent_runs', to: 'agent_runs' },
  { from: 'team_members', to: 'agent_team_members' },
  { from: 'tasks', to: 'agent_tasks' },
  { from: 'task_events', to: 'agent_task_events' },
];

const importTable = target.transaction(({ from, to }) => {
  const targetHasTable = target.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(to);
  if (!targetHasTable) {
    console.log(`Tabela destino ${to} nao existe — rode npm run migrate antes.`);
    return { from, to, imported: 0, skipped: 0 };
  }

  const rows = legacy.prepare(`SELECT * FROM ${from}`).all();
  if (!rows.length) return { from, to, imported: 0, skipped: 0 };

  const columns = Object.keys(rows[0]);
  const insert = target.prepare(
    `INSERT OR IGNORE INTO ${to} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  );

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const result = insert.run(...columns.map((column) => row[column]));
    if (result.changes > 0) imported += 1;
    else skipped += 1;
  }
  return { from, to, imported, skipped };
});

for (const table of tables) {
  const legacyHasTable = legacy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table.from);
  if (!legacyHasTable) {
    console.log(`Tabela legada ${table.from} nao existe — pulando.`);
    continue;
  }
  const { imported, skipped } = importTable(table);
  console.log(`${table.from} -> ${table.to}: ${imported} importados, ${skipped} ja existentes.`);
}

legacy.close();
target.close();
console.log('Importacao concluida.');
