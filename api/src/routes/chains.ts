import type { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { audit, buildIndex, bumpChainTimestamp, loadChain } from "../repo.js";
import { actor } from "../middleware.js";
import { zCreateChainInput } from "../zod-schemas.js";
import { reindexNode } from "../tfidf.js";
import { randomUUID } from "node:crypto";

export function mountChainRoutes(app: Hono): void {
  app.get("/api/index", (c) => c.json(buildIndex()));

  app.get("/api/chains/:id", (c) => {
    const chain = loadChain(c.req.param("id"));
    if (!chain) return c.json({ error: "not found" }, 404);
    return c.json(chain);
  });

  app.post("/api/chains", async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = zCreateChainInput.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const input = parsed.data;
    const a = actor(c);
    const id = input.seedIoc.value.startsWith("manual")
      ? `manual-${randomUUID().slice(0, 8)}`
      : `${input.category}-${shortHash(input.seedIoc.value)}-${randomUUID().slice(0, 4)}`;
    const score = 30; // user-created chains start at medium-low
    const severity = "medium" as const;
    db()
      .prepare(
        `INSERT INTO chains
         (id, category, family, source, seed_ioc_type, seed_ioc_value, first_seen,
          severity, severity_score, summary, tags_json,
          created_by_kind, created_by_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted')`,
      )
      .run(
        id,
        input.category,
        input.family,
        input.source,
        input.seedIoc.type,
        input.seedIoc.value,
        input.firstSeen,
        severity,
        score,
        input.summary || `${input.family} (${input.category}, manual)`,
        JSON.stringify(input.tags),
        a.kind,
        a.id,
      );
    db()
      .prepare(
        `INSERT INTO chains_fts (id, family, summary, tags, seed_ioc_value) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, input.family, input.summary, JSON.stringify(input.tags), input.seedIoc.value);
    audit("chain", id, "created", a, { input });
    return c.json({ id });
  });

  app.patch("/api/chains/:id", async (c) => {
    const id = c.req.param("id");
    const json = await c.req.json().catch(() => null);
    const schema = z.object({
      family: z.string().min(1).max(128).optional(),
      summary: z.string().max(1024).optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      severityScore: z.number().int().min(0).max(100).optional(),
      tags: z.array(z.string().max(64)).optional(),
      status: z.enum(["proposed", "accepted", "refuted", "archived"]).optional(),
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const sets: string[] = [];
    const args: unknown[] = [];
    if (parsed.data.family !== undefined) { sets.push("family = ?"); args.push(parsed.data.family); }
    if (parsed.data.summary !== undefined) { sets.push("summary = ?"); args.push(parsed.data.summary); }
    if (parsed.data.severity !== undefined) { sets.push("severity = ?"); args.push(parsed.data.severity); }
    if (parsed.data.severityScore !== undefined) { sets.push("severity_score = ?"); args.push(parsed.data.severityScore); }
    if (parsed.data.tags !== undefined) { sets.push("tags_json = ?"); args.push(JSON.stringify(parsed.data.tags)); }
    if (parsed.data.status !== undefined) { sets.push("status = ?"); args.push(parsed.data.status); }
    if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);
    sets.push("updated_at = datetime('now')");
    args.push(id);
    db().prepare(`UPDATE chains SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    audit("chain", id, "updated", a, parsed.data);
    bumpChainTimestamp(id);
    return c.json({ ok: true });
  });

  // Re-index all FTS rows (utility endpoint for maintenance)
  app.post("/api/admin/reindex", (c) => {
    const d = db();
    d.prepare("DELETE FROM chains_fts").run();
    d.prepare(
      `INSERT INTO chains_fts (id, family, summary, tags, seed_ioc_value)
       SELECT id, family, summary, tags_json, seed_ioc_value FROM chains`,
    ).run();
    const nodes = d.prepare("SELECT id FROM chain_nodes").all() as Array<{ id: string }>;
    for (const n of nodes) reindexNode(n.id);
    return c.json({ ok: true, nodes: nodes.length });
  });
}

function shortHash(s: string): string {
  // tiny deterministic hash (non-crypto)
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}
