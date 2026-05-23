#!/usr/bin/env tsx
// Read data/kb-seed/{benign,malicious}.json and upsert into indicators table.
// Idempotent — safe to re-run after editing the seed files.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { KB_SEED_DIR } from "./db.js";
import { kbUpsert } from "./kb.js";
import type { IndicatorPolarity, IndicatorType } from "./types.js";

interface SeedEntry {
  type: IndicatorType;
  value: string;
  category?: string;
  confidence?: number;
  notes?: string;
}

const FILES: Record<IndicatorPolarity, string> = {
  benign: resolve(KB_SEED_DIR, "benign.json"),
  malicious: resolve(KB_SEED_DIR, "malicious.json"),
};

// Bootstrap empty templates the first time so users see the shape.
function ensureTemplates(): void {
  if (!existsSync(FILES.benign)) {
    writeFileSync(FILES.benign, JSON.stringify({
      description: "Known-benign indicators. The agents will tag matches as 'benign-adjacent' rather than malicious.",
      indicators: [
        { type: "package", value: "com.android.settings", notes: "system package" },
        { type: "package", value: "com.google.android.gms", notes: "google play services" },
        { type: "domain", value: "play.googleapis.com", notes: "google play CDN" },
      ],
    }, null, 2));
    console.log(`[seed-kb] created template ${FILES.benign}`);
  }
  if (!existsSync(FILES.malicious)) {
    writeFileSync(FILES.malicious, JSON.stringify({
      description: "Known-malicious indicators. Hits raise confidence and pre-classify.",
      indicators: [
        { type: "package", value: "com.flubot.banker", category: "phishing", notes: "FluBot-family" },
        { type: "domain", value: "c2.flubot.invalid", category: "phishing", confidence: 0.95 },
      ],
    }, null, 2));
    console.log(`[seed-kb] created template ${FILES.malicious}`);
  }
}

function loadPool(path: string, polarity: IndicatorPolarity): SeedEntry[] {
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { indicators?: SeedEntry[] };
    if (!Array.isArray(parsed.indicators)) {
      console.warn(`[seed-kb] ${polarity}: 'indicators' array missing`);
      return [];
    }
    return parsed.indicators;
  } catch (err) {
    console.warn(`[seed-kb] ${polarity}: parse failed — ${(err as Error).message}`);
    return [];
  }
}

function main(): void {
  ensureTemplates();
  let created = 0;
  let flipped = 0;
  let updated = 0;
  for (const polarity of ["benign", "malicious"] as IndicatorPolarity[]) {
    const entries = loadPool(FILES[polarity], polarity);
    console.log(`[seed-kb] ${polarity}: ${entries.length} entries`);
    for (const e of entries) {
      if (!e.type || !e.value) continue;
      const r = kbUpsert({
        type: e.type,
        value: e.value,
        polarity,
        category: e.category ?? null,
        confidence: e.confidence,
        source: "seed",
        notesMd: e.notes ?? null,
        createdByKind: "user",
        createdById: "system",
      });
      if (r.created) created++;
      else if (r.flipped) flipped++;
      else updated++;
    }
  }
  console.log(`[seed-kb] DONE — created=${created} flipped=${flipped} updated/noop=${updated}`);
}

main();
