import { db } from "./db.js";
import type { Indicator, IndicatorPolarity, IndicatorType } from "./types.js";

export interface KbHit {
  type: IndicatorType;
  value: string;
  polarity: IndicatorPolarity;
  category: string | null;
  confidence: number;
  source: string | null;
  notesMd: string | null;
  indicatorId: number;
}

const _normalize = (s: string) => s.trim().toLowerCase();

export function kbLookup(type: IndicatorType, value: string): KbHit | null {
  const row = db()
    .prepare(
      `SELECT id, type, value, polarity, category, confidence, source, notes_md
       FROM indicators WHERE type = ? AND value = ? LIMIT 1`,
    )
    .get(type, _normalize(value)) as
    | {
        id: number; type: string; value: string; polarity: string;
        category: string | null; confidence: number; source: string | null; notes_md: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    indicatorId: row.id,
    type: row.type as IndicatorType,
    value: row.value,
    polarity: row.polarity as IndicatorPolarity,
    category: row.category,
    confidence: row.confidence,
    source: row.source,
    notesMd: row.notes_md,
  };
}

export function kbList(opts: { polarity?: IndicatorPolarity; type?: IndicatorType; q?: string; limit?: number } = {}): Indicator[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.polarity) { where.push("polarity = ?"); args.push(opts.polarity); }
  if (opts.type) { where.push("type = ?"); args.push(opts.type); }
  if (opts.q) { where.push("(value LIKE ? OR notes_md LIKE ?)"); args.push(`%${opts.q.toLowerCase()}%`, `%${opts.q.toLowerCase()}%`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(2000, opts.limit ?? 200);
  const rows = db()
    .prepare(
      `SELECT id, type, value, polarity, category, confidence, source, notes_md,
              created_at, created_by_kind, created_by_id
       FROM indicators ${whereSql}
       ORDER BY id DESC LIMIT ?`,
    )
    .all(...args, limit) as Array<{
    id: number; type: string; value: string; polarity: string; category: string | null;
    confidence: number; source: string | null; notes_md: string | null;
    created_at: string; created_by_kind: "user" | "agent"; created_by_id: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    type: r.type as IndicatorType,
    value: r.value,
    polarity: r.polarity as IndicatorPolarity,
    category: r.category as Indicator["category"],
    confidence: r.confidence,
    source: r.source,
    notesMd: r.notes_md,
    createdAt: r.created_at,
    createdBy: { kind: r.created_by_kind, id: r.created_by_id },
  }));
}

export function kbUpsert(args: {
  type: IndicatorType;
  value: string;
  polarity: IndicatorPolarity;
  category?: string | null;
  confidence?: number;
  source?: string | null;
  notesMd?: string | null;
  createdByKind: "user" | "agent";
  createdById: string;
}): { id: number; created: boolean; flipped: boolean } {
  const normalized = _normalize(args.value);
  const existing = db()
    .prepare("SELECT id, polarity FROM indicators WHERE type = ? AND value = ?")
    .get(args.type, normalized) as { id: number; polarity: string } | undefined;
  if (existing) {
    const flipped = existing.polarity !== args.polarity;
    if (flipped) {
      db().prepare(
        `INSERT INTO indicator_history (indicator_id, prev_polarity, new_polarity, reason, changed_by_kind, changed_by_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(existing.id, existing.polarity, args.polarity, args.notesMd ?? null, args.createdByKind, args.createdById);
      db().prepare("UPDATE indicators SET polarity = ?, source = ?, notes_md = ? WHERE id = ?")
        .run(args.polarity, args.source ?? null, args.notesMd ?? null, existing.id);
    } else if (args.notesMd) {
      db().prepare("UPDATE indicators SET notes_md = ? WHERE id = ?").run(args.notesMd, existing.id);
    }
    return { id: existing.id, created: false, flipped };
  }
  const res = db().prepare(
    `INSERT INTO indicators (type, value, polarity, category, confidence, source, notes_md, created_by_kind, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(args.type, normalized, args.polarity, args.category ?? null, args.confidence ?? 1.0,
        args.source ?? null, args.notesMd ?? null, args.createdByKind, args.createdById);
  return { id: Number(res.lastInsertRowid), created: true, flipped: false };
}
