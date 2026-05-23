import type { Hono } from "hono";
import { db } from "../db.js";
import { audit, bumpChainTimestamp } from "../repo.js";
import { actor } from "../middleware.js";
import { zCreateCommentInput } from "../zod-schemas.js";

export function mountCommentRoutes(app: Hono): void {
  app.get("/api/nodes/:nodeId/comments", (c) => {
    const nodeId = c.req.param("nodeId");
    const rows = db()
      .prepare(
        `SELECT id, node_id, body_md, created_at, created_by_kind, created_by_id
         FROM comments WHERE node_id = ? ORDER BY id ASC`,
      )
      .all(nodeId) as Array<{
      id: number;
      node_id: string;
      body_md: string;
      created_at: string;
      created_by_kind: "user" | "agent";
      created_by_id: string;
    }>;
    return c.json(
      rows.map((r) => ({
        id: r.id,
        nodeId: r.node_id,
        bodyMd: r.body_md,
        createdAt: r.created_at,
        createdBy: { kind: r.created_by_kind, id: r.created_by_id },
      })),
    );
  });

  app.post("/api/nodes/:nodeId/comments", async (c) => {
    const nodeId = c.req.param("nodeId");
    const json = await c.req.json().catch(() => null);
    const parsed = zCreateCommentInput.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const node = db().prepare("SELECT chain_id FROM chain_nodes WHERE id = ?").get(nodeId) as
      | { chain_id: string }
      | undefined;
    if (!node) return c.json({ error: "node not found" }, 404);
    const a = actor(c);
    const res = db()
      .prepare(
        `INSERT INTO comments (node_id, body_md, created_by_kind, created_by_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(nodeId, parsed.data.bodyMd, a.kind, a.id);
    audit("comment", String(res.lastInsertRowid), "created", a);
    bumpChainTimestamp(node.chain_id);
    return c.json({ id: Number(res.lastInsertRowid) });
  });
}
