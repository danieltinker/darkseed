// File watcher for data/reports/inbox/ — auto-ingests on add / change.
// Starts inside the server process so it shares the same DB connection.

import chokidar from "chokidar";
import { readFileSync, renameSync, mkdirSync, existsSync, statSync } from "node:fs";
import { resolve as _resolve, basename } from "node:path";
import { REPORTS_INBOX, REPORTS_PROCESSED } from "./db.js";
import { ingestReport } from "./report-ingester.js";
const resolve = _resolve;

const PROCESSED_DIR = REPORTS_PROCESSED;
mkdirSync(PROCESSED_DIR, { recursive: true });

let started = false;

export function startReportWatcher(): void {
  if (started) return;
  started = true;
  if (process.env.DARKSEED_DISABLE_WATCHER === "1") {
    console.log("[watcher] disabled via DARKSEED_DISABLE_WATCHER=1");
    return;
  }
  const watcher = chokidar.watch(REPORTS_INBOX, {
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    ignoreInitial: false,
    depth: 0,
  });

  console.log(`[watcher] watching ${REPORTS_INBOX}/*.md`);

  watcher.on("add", async (abs) => { if (abs.endsWith(".md")) await handle(abs, "add"); });
  watcher.on("change", async (abs) => { if (abs.endsWith(".md")) await handle(abs, "change"); });
  watcher.on("error", (err) => console.error("[watcher] error:", err));
}

async function handle(abs: string, _kind: "add" | "change"): Promise<void> {
  if (!existsSync(abs)) return;
  if (statSync(abs).size === 0) return;
  const name = basename(abs);
  try {
    const raw = readFileSync(abs, "utf8");
    const result = await ingestReport({
      raw,
      sourcePath: abs,
      filename: name,
      by: { kind: "agent", id: "report-watcher" },
    });
    console.log(`[watcher] ${name} → ${result.created ? "ingested" : "no-op (same content)"} chain=${result.chainId}`);
    if (result.created) {
      // Archive: move out of inbox to processed/ so we don't re-process on next boot
      const dest = resolve(PROCESSED_DIR, `${result.reportId}__${name}`);
      try { renameSync(abs, dest); }
      catch (err) { console.warn(`[watcher] could not archive ${abs}:`, (err as Error).message); }
    }
  } catch (err) {
    console.error(`[watcher] failed on ${name}:`, (err as Error).message);
  }
}
