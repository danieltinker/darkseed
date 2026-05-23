import type { Hono } from "hono";
import { db } from "../db.js";

export function mountLabelRoutes(app: Hono): void {
  app.get("/api/labels", (c) => {
    const limit = Math.min(1000, Number(c.req.query("limit") ?? 200));
    const rows = db()
      .prepare(
        `SELECT id, entity_type, entity_id, signal, before_json, after_json,
                source_agent_kind, source_agent_id, created_at, created_by_kind, created_by_id
         FROM labels ORDER BY id DESC LIMIT ?`,
      )
      .all(limit) as Array<{
      id: number;
      entity_type: string;
      entity_id: string;
      signal: string;
      before_json: string | null;
      after_json: string | null;
      source_agent_kind: string | null;
      source_agent_id: string | null;
      created_at: string;
      created_by_kind: "user" | "agent";
      created_by_id: string;
    }>;
    return c.json(rows);
  });

  app.get("/api/labels.jsonl", (c) => {
    const rows = db()
      .prepare(
        `SELECT id, entity_type, entity_id, signal, before_json, after_json,
                source_agent_kind, source_agent_id, created_at, created_by_kind, created_by_id
         FROM labels ORDER BY id ASC`,
      )
      .all() as Array<Record<string, unknown>>;
    c.header("Content-Type", "application/x-ndjson");
    c.header("Content-Disposition", `attachment; filename="darkseed-labels.jsonl"`);
    return c.body(rows.map((r) => JSON.stringify(r)).join("\n"));
  });
}
