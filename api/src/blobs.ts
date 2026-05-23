import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db, BLOB_DIR } from "./db.js";

function blobPath(sha256: string): string {
  const subdir = resolve(BLOB_DIR, sha256.slice(0, 2));
  mkdirSync(subdir, { recursive: true });
  return resolve(subdir, sha256);
}

export interface StoredBlob {
  sha256: string;
  size: number;
  mime?: string;
  filename?: string;
}

export function storeBlob(buffer: Buffer, opts: { mime?: string; filename?: string } = {}): StoredBlob {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const path = blobPath(sha256);
  if (!existsSync(path)) {
    writeFileSync(path, buffer);
  }
  const size = buffer.length;
  const d = db();
  const existing = d
    .prepare("SELECT sha256 FROM blobs WHERE sha256 = ?")
    .get(sha256) as { sha256: string } | undefined;
  if (existing) {
    d.prepare("UPDATE blobs SET ref_count = ref_count + 1 WHERE sha256 = ?").run(sha256);
  } else {
    d.prepare(
      "INSERT INTO blobs (sha256, size, mime, filename, ref_count) VALUES (?, ?, ?, ?, 1)",
    ).run(sha256, size, opts.mime ?? null, opts.filename ?? null);
  }
  return { sha256, size, mime: opts.mime, filename: opts.filename };
}

export function readBlob(sha256: string): { buffer: Buffer; mime?: string; filename?: string } | null {
  const path = blobPath(sha256);
  if (!existsSync(path)) return null;
  const meta = db()
    .prepare("SELECT mime, filename, size FROM blobs WHERE sha256 = ?")
    .get(sha256) as { mime?: string; filename?: string; size: number } | undefined;
  const buffer = readFileSync(path);
  return { buffer, mime: meta?.mime, filename: meta?.filename };
}

export function blobMeta(sha256: string): { sha256: string; size: number; mime?: string; filename?: string } | null {
  const m = db()
    .prepare("SELECT sha256, size, mime, filename FROM blobs WHERE sha256 = ?")
    .get(sha256) as { sha256: string; size: number; mime?: string; filename?: string } | undefined;
  if (!m) {
    const path = blobPath(sha256);
    if (!existsSync(path)) return null;
    const size = statSync(path).size;
    return { sha256, size };
  }
  return m;
}

export function decRef(sha256: string): void {
  const d = db();
  const row = d.prepare("SELECT ref_count FROM blobs WHERE sha256 = ?").get(sha256) as
    | { ref_count: number }
    | undefined;
  if (!row) return;
  if (row.ref_count > 1) {
    d.prepare("UPDATE blobs SET ref_count = ref_count - 1 WHERE sha256 = ?").run(sha256);
  } else {
    d.prepare("DELETE FROM blobs WHERE sha256 = ?").run(sha256);
    // We keep the file on disk for now (could GC later).
  }
}
