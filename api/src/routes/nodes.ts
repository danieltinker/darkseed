import type { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { audit, bumpChainTimestamp, loadChain, recordLabel } from "../repo.js";
import { actor } from "../middleware.js";
import { zCreateEdgeInput, zCreateNodeInput, zUpdateNodeInput } from "../zod-schemas.js";
import { randomUUID } from "node:crypto";
import { reindexNode } from "../tfidf.js";

export function mountNodeRoutes(app: Hono): void {
  // Create a new node in a chain
  app.post("/api/chains/:id/nodes", async (c) => {
    const chainId = c.req.param("id");
    const chain = loadChain(chainId);
    if (!chain) return c.json({ error: "chain not found" }, 404);
    const json = await c.req.json().catch(() => null);
    const parsed = zCreateNodeInput.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const input = parsed.data;
    const a = actor(c);
    const newId = `${chainId}--n${randomUUID().slice(0, 8)}`;
    const step =
      input.step ??
      (db().prepare("SELECT COALESCE(MAX(step), 0) + 1 AS s FROM chain_nodes WHERE chain_id = ?").get(chainId) as { s: number }).s;
    db()
      .prepare(
        `INSERT INTO chain_nodes
         (id, chain_id, step, technique_id, technique_name, tactic, title, description,
          status, created_by_kind, created_by_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId,
        chainId,
        step,
        input.techniqueId,
        input.techniqueName,
        input.tactic,
        input.title,
        input.description,
        input.status,
        a.kind,
        a.id,
      );
    for (const ioc of input.iocs) {
      db()
        .prepare("INSERT INTO iocs (node_id, type, value, source) VALUES (?, ?, ?, ?)")
        .run(newId, ioc.type, ioc.value, ioc.source ?? null);
    }
    if (input.after) {
      db()
        .prepare(
          "INSERT OR IGNORE INTO chain_edges (chain_id, from_node, to_node) VALUES (?, ?, ?)",
        )
        .run(chainId, input.after, newId);
    }
    audit("node", newId, input.status === "proposed" ? "proposed" : "created", a, input);
    bumpChainTimestamp(chainId);
    reindexNode(newId);
    return c.json({ id: newId, step });
  });

  app.patch("/api/chains/:chainId/nodes/:nodeId", async (c) => {
    const { chainId, nodeId } = c.req.param();
    const json = await c.req.json().catch(() => null);
    const parsed = zUpdateNodeInput.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const before = db().prepare("SELECT * FROM chain_nodes WHERE id = ?").get(nodeId);
    if (!before) return c.json({ error: "not found" }, 404);
    const a = actor(c);
    const sets: string[] = [];
    const args: unknown[] = [];
    if (parsed.data.techniqueId !== undefined) { sets.push("technique_id = ?"); args.push(parsed.data.techniqueId); }
    if (parsed.data.techniqueName !== undefined) { sets.push("technique_name = ?"); args.push(parsed.data.techniqueName); }
    if (parsed.data.tactic !== undefined) { sets.push("tactic = ?"); args.push(parsed.data.tactic); }
    if (parsed.data.title !== undefined) { sets.push("title = ?"); args.push(parsed.data.title); }
    if (parsed.data.description !== undefined) { sets.push("description = ?"); args.push(parsed.data.description); }
    if (parsed.data.step !== undefined) { sets.push("step = ?"); args.push(parsed.data.step); }
    if (parsed.data.status !== undefined) { sets.push("status = ?"); args.push(parsed.data.status); }
    if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);
    sets.push("updated_at = datetime('now')");
    args.push(nodeId);
    db().prepare(`UPDATE chain_nodes SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    audit("node", nodeId, "updated", a, parsed.data);
    recordLabel({
      entityType: "node",
      entityId: nodeId,
      signal: "edited",
      beforeJson: before,
      afterJson: parsed.data,
      by: a,
    });
    bumpChainTimestamp(chainId);
    reindexNode(nodeId);
    return c.json({ ok: true });
  });

  app.delete("/api/chains/:chainId/nodes/:nodeId", (c) => {
    const { chainId, nodeId } = c.req.param();
    const a = actor(c);
    const row = db().prepare("SELECT id FROM chain_nodes WHERE id = ?").get(nodeId);
    if (!row) return c.json({ error: "not found" }, 404);
    db().prepare("DELETE FROM chain_nodes WHERE id = ?").run(nodeId);
    audit("node", nodeId, "deleted", a);
    bumpChainTimestamp(chainId);
    return c.json({ ok: true });
  });

  // Edge creation
  app.post("/api/chains/:id/edges", async (c) => {
    const chainId = c.req.param("id");
    const json = await c.req.json().catch(() => null);
    const parsed = zCreateEdgeInput.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    try {
      db()
        .prepare(
          "INSERT INTO chain_edges (chain_id, from_node, to_node, label) VALUES (?, ?, ?, ?)",
        )
        .run(chainId, parsed.data.from, parsed.data.to, parsed.data.label ?? null);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
    audit("edge", `${parsed.data.from}->${parsed.data.to}`, "created", a, parsed.data);
    bumpChainTimestamp(chainId);
    return c.json({ ok: true });
  });

  app.delete("/api/chains/:id/edges", async (c) => {
    const chainId = c.req.param("id");
    const json = await c.req.json().catch(() => null);
    const parsed = z.object({ from: z.string(), to: z.string() }).safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    db()
      .prepare("DELETE FROM chain_edges WHERE chain_id = ? AND from_node = ? AND to_node = ?")
      .run(chainId, parsed.data.from, parsed.data.to);
    audit("edge", `${parsed.data.from}->${parsed.data.to}`, "deleted", a);
    bumpChainTimestamp(chainId);
    return c.json({ ok: true });
  });

  // Review proposed node (accept / reject / edit)
  app.post("/api/nodes/:nodeId/review", async (c) => {
    const nodeId = c.req.param("nodeId");
    const json = await c.req.json().catch(() => null);
    const parsed = z
      .object({
        decision: z.enum(["accept", "reject", "edit"]),
        edits: z.record(z.unknown()).optional(),
      })
      .safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const before = db().prepare("SELECT * FROM chain_nodes WHERE id = ?").get(nodeId) as
      | (Record<string, unknown> & { chain_id: string; created_by_kind: string; created_by_id: string })
      | undefined;
    if (!before) return c.json({ error: "not found" }, 404);
    const sourceAgent = { kind: before.created_by_kind as "agent" | "user", id: before.created_by_id };
    if (parsed.data.decision === "accept") {
      db().prepare("UPDATE chain_nodes SET status='accepted', updated_at=datetime('now') WHERE id = ?").run(nodeId);
      audit("node", nodeId, "accepted", a);
      recordLabel({ entityType: "node", entityId: nodeId, signal: "approved", beforeJson: before, sourceAgent, by: a });
    } else if (parsed.data.decision === "reject") {
      db().prepare("UPDATE chain_nodes SET status='refuted', updated_at=datetime('now') WHERE id = ?").run(nodeId);
      audit("node", nodeId, "rejected", a);
      recordLabel({ entityType: "node", entityId: nodeId, signal: "rejected", beforeJson: before, sourceAgent, by: a });
    } else {
      const edits = parsed.data.edits ?? {};
      const sets: string[] = [];
      const args: unknown[] = [];
      for (const [k, v] of Object.entries(edits)) {
        if (["title", "description", "techniqueId", "techniqueName", "tactic"].includes(k)) {
          const col = camelToSnake(k);
          sets.push(`${col} = ?`);
          args.push(v);
        }
      }
      if (sets.length > 0) {
        sets.push("status='accepted'");
        sets.push("updated_at=datetime('now')");
        args.push(nodeId);
        db().prepare(`UPDATE chain_nodes SET ${sets.join(", ")} WHERE id = ?`).run(...args);
      }
      audit("node", nodeId, "edited+accepted", a, edits);
      recordLabel({ entityType: "node", entityId: nodeId, signal: "edited", beforeJson: before, afterJson: edits, sourceAgent, by: a });
    }
    bumpChainTimestamp(before.chain_id);
    reindexNode(nodeId);
    return c.json({ ok: true });
  });
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}
