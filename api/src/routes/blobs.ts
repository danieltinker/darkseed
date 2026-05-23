import type { Hono } from "hono";
import { blobMeta, readBlob } from "../blobs.js";

export function mountBlobRoutes(app: Hono): void {
  app.get("/api/blobs/:sha256/meta", (c) => {
    const sha = c.req.param("sha256");
    const m = blobMeta(sha);
    if (!m) return c.json({ error: "not found" }, 404);
    return c.json(m);
  });

  app.get("/api/blobs/:sha256", (c) => {
    const sha = c.req.param("sha256");
    const b = readBlob(sha);
    if (!b) return c.json({ error: "not found" }, 404);
    c.header("Content-Type", b.mime ?? "application/octet-stream");
    if (c.req.query("download") === "1" && b.filename) {
      c.header("Content-Disposition", `attachment; filename="${encodeURIComponent(b.filename)}"`);
    } else if (b.filename) {
      c.header("Content-Disposition", `inline; filename="${encodeURIComponent(b.filename)}"`);
    }
    return c.body(b.buffer);
  });
}
