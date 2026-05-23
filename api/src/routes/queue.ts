import type { Hono } from "hono";
import { db } from "../db.js";

export function mountQueueRoutes(app: Hono): void {
  app.get("/api/queue", (c) => {
    const nodes = db()
      .prepare(
        `SELECT n.id, n.chain_id, n.title, n.technique_id, n.technique_name, n.tactic,
                n.description, n.created_at, n.created_by_kind, n.created_by_id,
                c.category, c.family
         FROM chain_nodes n
         JOIN chains c ON c.id = n.chain_id
         WHERE n.status = 'proposed'
         ORDER BY n.created_at DESC
         LIMIT 200`,
      )
      .all() as Array<{
      id: string; chain_id: string; title: string; technique_id: string; technique_name: string;
      tactic: string; description: string; created_at: string;
      created_by_kind: "user" | "agent"; created_by_id: string;
      category: string; family: string;
    }>;
    const evidence = db()
      .prepare(
        `SELECT e.id, e.node_id, e.category, e.kind, e.label, e.value,
                e.created_at, e.created_by_kind, e.created_by_id,
                n.chain_id, c.family, c.category AS chain_category
         FROM evidence e
         JOIN chain_nodes n ON n.id = e.node_id
         JOIN chains c ON c.id = n.chain_id
         WHERE e.status = 'proposed'
         ORDER BY e.created_at DESC
         LIMIT 200`,
      )
      .all() as Array<{
      id: string; node_id: string; category: string; kind: string; label: string; value: string;
      created_at: string; created_by_kind: "user" | "agent"; created_by_id: string;
      chain_id: string; family: string; chain_category: string;
    }>;
    return c.json({
      nodes: nodes.map((n) => ({
        id: n.id, chainId: n.chain_id, nodeId: n.id,
        summary: `${n.title} — ${n.technique_id} (${n.tactic}) — ${n.family}`,
        title: n.title, techniqueId: n.technique_id, techniqueName: n.technique_name, tactic: n.tactic,
        description: n.description, chainFamily: n.family, chainCategory: n.category,
        proposedBy: { kind: n.created_by_kind, id: n.created_by_id }, proposedAt: n.created_at,
      })),
      evidence: evidence.map((e) => ({
        id: e.id, chainId: e.chain_id, nodeId: e.node_id,
        summary: `${e.kind} — ${e.label}`,
        kind: e.kind, evCategory: e.category, label: e.label, value: e.value,
        chainFamily: e.family, chainCategory: e.chain_category,
        proposedBy: { kind: e.created_by_kind, id: e.created_by_id }, proposedAt: e.created_at,
      })),
    });
  });
}
