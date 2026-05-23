import type { Hono } from "hono";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { db, REPORTS_INBOX } from "../db.js";
import { audit, recordLabel } from "../repo.js";
import { actor } from "../middleware.js";
import { ingestReport } from "../report-ingester.js";
import { readBlob } from "../blobs.js";
import { resolve } from "node:path";

type ReportRow = {
  id: string;
  app_id: string | null;
  source_path: string | null;
  filename: string | null;
  body_blob_sha: string;
  content_hash: string;
  declared_category: string | null;
  declared_label: string | null;
  effective_label: string | null;
  flipped: number;
  status: string;
  ingested_chain_id: string | null;
  frontmatter_json: string | null;
  tags_json: string;
  first_seen_iso: string | null;
  imported_at: string;
  processed_at: string | null;
  reviewed_at: string | null;
  reviewed_by_kind: string | null;
  reviewed_by_id: string | null;
};

function rowToReport(r: ReportRow) {
  return {
    id: r.id,
    appId: r.app_id,
    sourcePath: r.source_path,
    filename: r.filename,
    bodyBlobSha: r.body_blob_sha,
    contentHash: r.content_hash,
    declaredCategory: r.declared_category,
    declaredLabel: r.declared_label,
    effectiveLabel: r.effective_label,
    flipped: r.flipped === 1,
    status: r.status,
    ingestedChainId: r.ingested_chain_id,
    frontmatter: r.frontmatter_json ? JSON.parse(r.frontmatter_json) : {},
    tags: JSON.parse(r.tags_json),
    firstSeenIso: r.first_seen_iso,
    importedAt: r.imported_at,
    processedAt: r.processed_at,
    reviewedAt: r.reviewed_at,
    reviewedBy: r.reviewed_by_id
      ? { kind: r.reviewed_by_kind as "user" | "agent", id: r.reviewed_by_id }
      : null,
  };
}

export function mountReportRoutes(app: Hono): void {
  app.get("/api/reports", (c) => {
    const flipped = c.req.query("flipped");
    const status = c.req.query("status");
    const q = c.req.query("q");
    const where: string[] = [];
    const args: unknown[] = [];
    if (flipped === "1") { where.push("flipped = 1"); }
    if (status) { where.push("status = ?"); args.push(status); }
    if (q) {
      where.push("(id LIKE ? OR filename LIKE ? OR frontmatter_json LIKE ?)");
      args.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = db()
      .prepare(`SELECT * FROM reports ${whereSql} ORDER BY imported_at DESC LIMIT 500`)
      .all(...args) as ReportRow[];
    const counts = {
      total: (db().prepare("SELECT COUNT(*) AS n FROM reports").get() as { n: number }).n,
      pending: (db().prepare("SELECT COUNT(*) AS n FROM reports WHERE status='pending'").get() as { n: number }).n,
      ingested: (db().prepare("SELECT COUNT(*) AS n FROM reports WHERE status='ingested'").get() as { n: number }).n,
      flipped: (db().prepare("SELECT COUNT(*) AS n FROM reports WHERE flipped=1").get() as { n: number }).n,
    };
    return c.json({ counts, items: rows.map(rowToReport) });
  });

  app.get("/api/reports/:id", (c) => {
    const r = db().prepare("SELECT * FROM reports WHERE id = ?").get(c.req.param("id")) as ReportRow | undefined;
    if (!r) return c.json({ error: "not found" }, 404);
    const body = readBlob(r.body_blob_sha);
    return c.json({
      report: rowToReport(r),
      bodyMd: body ? body.buffer.toString("utf8") : null,
    });
  });

  // Manual trigger — ingest a single file from the inbox by filename.
  app.post("/api/reports/ingest", async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = z.object({
      filename: z.string().min(1).max(512).optional(),
      content: z.string().optional(),
    }).safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    let raw: string;
    let sourcePath: string | undefined;
    let filename: string | undefined = parsed.data.filename;
    if (parsed.data.content) {
      raw = parsed.data.content;
    } else if (filename) {
      sourcePath = resolve(REPORTS_INBOX, filename);
      if (!existsSync(sourcePath)) return c.json({ error: "file not found in inbox" }, 404);
      raw = readFileSync(sourcePath, "utf8");
    } else {
      return c.json({ error: "filename or content required" }, 400);
    }
    const out = await ingestReport({ raw, sourcePath, filename, by: a });
    return c.json(out);
  });

  // Reviewer sets / flips the effective label
  app.post("/api/reports/:id/label", async (c) => {
    const id = c.req.param("id");
    const json = await c.req.json().catch(() => null);
    const parsed = z.object({
      effectiveLabel: z.enum(["tp", "fp"]),
      notesMd: z.string().max(8192).optional(),
    }).safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const row = db().prepare("SELECT declared_label, effective_label, ingested_chain_id FROM reports WHERE id = ?")
      .get(id) as { declared_label: string | null; effective_label: string | null; ingested_chain_id: string | null } | undefined;
    if (!row) return c.json({ error: "not found" }, 404);
    const flipped = row.declared_label !== null && row.declared_label !== parsed.data.effectiveLabel ? 1 : 0;
    db().prepare(
      `UPDATE reports SET effective_label = ?, flipped = ?, reviewed_at = datetime('now'),
       reviewed_by_kind = ?, reviewed_by_id = ? WHERE id = ?`,
    ).run(parsed.data.effectiveLabel, flipped, a.kind, a.id, id);

    audit("evidence", id, flipped ? "report_label_flipped" : "report_label_confirmed", a, parsed.data);

    if (flipped) {
      const dir = row.declared_label === "tp" ? "flipped_tp_to_fp" : "flipped_fp_to_tp";
      recordLabel({
        entityType: "evidence",
        entityId: id,
        signal: dir as "approved" | "rejected" | "edited" | "verified" | "refuted",
        beforeJson: { declared: row.declared_label, prior: row.effective_label },
        afterJson: { effective: parsed.data.effectiveLabel, notes: parsed.data.notesMd },
        by: a,
      });

      // Mirror the flip onto the ingested chain's verdict
      if (row.ingested_chain_id) {
        const newVerdict = parsed.data.effectiveLabel === "tp" ? "malicious" : "benign";
        db().prepare(
          `UPDATE chains SET verdict = ?, verdict_source = 'flipped', verdict_set_at = datetime('now'),
           verdict_set_by_kind = ?, verdict_set_by_id = ?, verdict_notes_md = COALESCE(?, verdict_notes_md)
           WHERE id = ?`,
        ).run(newVerdict, a.kind, a.id, parsed.data.notesMd ?? null, row.ingested_chain_id);
      }
    }
    return c.json({ ok: true, flipped: !!flipped });
  });
}
