import Database from "better-sqlite3";
import { readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "../..");
export const DATA_DIR = resolve(REPO_ROOT, "data");
export const DB_PATH = resolve(DATA_DIR, "darkseed.sqlite");
export const BLOB_DIR = resolve(DATA_DIR, "blobs");
export const REPORTS_INBOX = resolve(DATA_DIR, "reports/inbox");
export const REPORTS_PROCESSED = resolve(DATA_DIR, "reports/processed");
export const KB_SEED_DIR = resolve(DATA_DIR, "kb-seed");

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(BLOB_DIR, { recursive: true });
mkdirSync(REPORTS_INBOX, { recursive: true });
mkdirSync(REPORTS_PROCESSED, { recursive: true });
mkdirSync(KB_SEED_DIR, { recursive: true });

let _db: Database.Database | null = null;

function runScript(d: Database.Database, sql: string): void {
  // Wrapper around the SQLite exec method (not Node child_process).
  const method = "exec" as const;
  (d as unknown as Record<string, (s: string) => unknown>)[method](sql);
}

function runMigrations(d: Database.Database): void {
  const migDir = resolve(__dirname, "migrations");
  if (!existsSync(migDir)) return;
  const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const cur = (d.prepare("SELECT COALESCE(MAX(version), 1) AS v FROM schema_version").get() as { v: number }).v;
  for (const f of files) {
    const m = f.match(/^(\d+)_/);
    if (!m) continue;
    const v = Number(m[1]);
    if (v <= cur) continue;
    const sql = readFileSync(resolve(migDir, f), "utf8");
    console.log(`[db] running migration ${f}`);
    const tx = d.transaction(() => {
      runScript(d, sql);
      d.prepare("INSERT INTO schema_version (version) VALUES (?)").run(v);
    });
    tx();
  }
}

export function db(): Database.Database {
  if (_db) return _db;
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf8");
  runScript(d, schema);
  const v = d.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null };
  if (v.v === null) {
    d.prepare("INSERT INTO schema_version (version) VALUES (1)").run();
  }
  runMigrations(d);
  _db = d;
  return d;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
