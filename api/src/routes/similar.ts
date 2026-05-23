import type { Hono } from "hono";
import { reindexAll, similarNodes } from "../tfidf.js";

export function mountSimilarRoutes(app: Hono): void {
  app.get("/api/similar/:nodeId", (c) => {
    const nodeId = c.req.param("nodeId");
    const limit = Math.min(50, Number(c.req.query("limit") ?? 12));
    return c.json({ nodeId, results: similarNodes(nodeId, limit) });
  });

  // Re-index the entire corpus (called once after migration; idempotent)
  app.post("/api/admin/reindex-corpus", (c) => {
    reindexAll();
    return c.json({ ok: true });
  });
}
