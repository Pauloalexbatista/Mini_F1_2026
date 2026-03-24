import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'fs';

// Se o Volume do Coolify existir (Produção Cloud), guardamos a Base de Dados na "Caixa Forte".
// Caso contrário (no PC local do Paulo), guardamos ao lado do ficheiro como habitualmente.
const COOLIFY_VOLUME_PATH = '/app/server_data';
const isCoolify = fs.existsSync(COOLIFY_VOLUME_PATH) || process.env.NODE_ENV === 'production';
const dbFolder = isCoolify ? COOLIFY_VOLUME_PATH : __dirname;

const dbFile = path.resolve(dbFolder, 'database.sqlite');
console.log(`[F1 Engine] A iniciar ligação à Base de Dados SQLite em: ${dbFile}`);
export async function initDB() {
  const db = await open({
    filename: dbFile,
    driver: sqlite3.Database
  });

  // Ativar W.A.L. (Write-Ahead Logging) para Suporte Multi-Jogadores (Concorrência Absoluta sem Locks)
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA synchronous = NORMAL;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'pilot',
      pilot_name TEXT NOT NULL,
      selected_car_id INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      svg_data TEXT NOT NULL,
      pit_svg_data TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS leaderboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      lap_time_ms INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (track_id) REFERENCES tracks(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Safe Migration: Add customized Garage color columns
  try {
      await db.exec("ALTER TABLE users ADD COLUMN primary_color TEXT DEFAULT '#E10600';");
      await db.exec("ALTER TABLE users ADD COLUMN secondary_color TEXT DEFAULT '#000000';");
      await db.exec("ALTER TABLE users ADD COLUMN helmet_color TEXT DEFAULT '#FFDD00';");
      await db.exec("ALTER TABLE users ADD COLUMN controls TEXT;");
      console.log("[DB] Added custom color columns and controls to users table.");
  } catch (e) {
      // Columns likely already exist
  }

  return db;
}
