import type { Hono } from "hono";
import { db } from "../db.js";

export function mountAuditRoutes(app: Hono): void {
  app.get("/api/audit", (c) => {
    const entityType = c.req.query("entity_type");
    const entityId = c.req.query("entity_id");
    const limit = Math.min(500, Number(c.req.query("limit") ?? 100));
    const where: string[] = [];
    const args: unknown[] = [];
    if (entityType) { where.push("entity_type = ?"); args.push(entityType); }
    if (entityId) { where.push("entity_id = ?"); args.push(entityId); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = db()
      .prepare(
        `SELECT id, entity_type, entity_id, action, actor_kind, actor_id, diff_json, created_at
         FROM audit_log ${whereSql}
         ORDER BY id DESC LIMIT ?`,
      )
      .all(...args, limit) as Array<{
      id: number;
      entity_type: string;
      entity_id: string;
      action: string;
      actor_kind: "user" | "agent";
      actor_id: string;
      diff_json: string | null;
      created_at: string;
    }>;
    return c.json(
      rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        actor: { kind: r.actor_kind, id: r.actor_id },
        diff: r.diff_json ? JSON.parse(r.diff_json) : null,
        createdAt: r.created_at,
      })),
    );
  });
}
