#!/usr/bin/env node
// Mirror data/ → dashboard/public/data/ so Vite serves it as static assets.
// We use a copy (not a symlink) so it works on Windows + simplifies Vite handling.

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "data");
const DST = resolve(ROOT, "dashboard/public/data");

try {
  await stat(SRC);
} catch {
  console.error(`[sync] no data at ${SRC} — run "pnpm generate" first.`);
  process.exit(1);
}

await rm(DST, { recursive: true, force: true });
await mkdir(dirname(DST), { recursive: true });
await cp(SRC, DST, { recursive: true });
console.log(`[sync] ${SRC} → ${DST}`);
