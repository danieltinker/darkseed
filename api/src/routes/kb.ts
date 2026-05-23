import type { Hono } from "hono";
import { z } from "zod";
import { audit } from "../repo.js";
import { actor } from "../middleware.js";
import { kbList, kbLookup, kbUpsert } from "../kb.js";
import { db } from "../db.js";

const zType = z.enum(["package", "domain", "ip", "sha256", "md5", "cert", "ja3", "elf", "url", "phone", "email"]);
const zPolarity = z.enum(["benign", "malicious"]);

export function mountKbRoutes(app: Hono): void {
  app.get("/api/kb", (c) => {
    const polarity = c.req.query("polarity") as "benign" | "malicious" | undefined;
    const type = c.req.query("type") as Parameters<typeof kbList>[0]["type"] | undefined;
    const q = c.req.query("q") ?? undefined;
    const limit = Number(c.req.query("limit") ?? 500);
    const items = kbList({ polarity, type, q, limit });
    const counts = {
      benign: (db().prepare("SELECT COUNT(*) AS n FROM indicators WHERE polarity='benign'").get() as { n: number }).n,
      malicious: (db().prepare("SELECT COUNT(*) AS n FROM indicators WHERE polarity='malicious'").get() as { n: number }).n,
    };
    return c.json({ items, counts });
  });

  app.get("/api/kb/lookup", (c) => {
    const type = zType.safeParse(c.req.query("type"));
    const value = c.req.query("value");
    if (!type.success || !value) return c.json({ error: "type+value required" }, 400);
    const hit = kbLookup(type.data, value);
    return c.json({ hit });
  });

  // Promote / upsert
  app.post("/api/kb", async (c) => {
    const json = await c.req.json().catch(() => null);
    const schema = z.object({
      type: zType,
      value: z.string().min(1).max(2048),
      polarity: zPolarity,
      category: z.string().max(64).optional(),
      confidence: z.number().min(0).max(1).optional(),
      source: z.string().max(256).optional(),
      notesMd: z.string().max(16_384).optional(),
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const out = kbUpsert({ ...parsed.data, createdByKind: a.kind, createdById: a.id });
    audit("evidence", String(out.id), out.created ? "kb_created" : (out.flipped ? "kb_flipped" : "kb_updated"), a, parsed.data);
    return c.json(out);
  });

  app.delete("/api/kb/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
    const a = actor(c);
    db().prepare("DELETE FROM indicators WHERE id = ?").run(id);
    audit("evidence", String(id), "kb_deleted", a);
    return c.json({ ok: true });
  });
}
