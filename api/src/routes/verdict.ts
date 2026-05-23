import type { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { audit, bumpChainTimestamp, recordLabel } from "../repo.js";
import { actor } from "../middleware.js";

const zSetVerdictInput = z.object({
  verdict: z.enum(["pending", "malicious", "benign", "inconclusive"]),
  notes: z.string().max(8192).optional(),
  source: z.enum(["agent", "reviewer", "flipped"]).optional(),
  agentInitial: z.enum(["pending", "malicious", "benign", "inconclusive"]).optional(),
  agentConfidence: z.number().min(0).max(1).optional(),
});

const zNodeFeedbackInput = z.object({
  decision: z.enum(["agree", "disagree", "edit", "note_only"]),
  notesMd: z.string().max(16_384).optional(),
});

const zEvidenceFeedbackInput = zNodeFeedbackInput;

export function mountVerdictRoutes(app: Hono): void {
  // Set / update chain verdict
  app.post("/api/chains/:id/verdict", async (c) => {
    const id = c.req.param("id");
    const json = await c.req.json().catch(() => null);
    const parsed = zSetVerdictInput.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const before = db().prepare(
      "SELECT verdict, verdict_source, agent_initial_verdict FROM chains WHERE id = ?",
    ).get(id) as { verdict: string; verdict_source: string | null; agent_initial_verdict: string | null } | undefined;
    if (!before) return c.json({ error: "not found" }, 404);

    const input = parsed.data;
    // Auto-detect source
    let source = input.source;
    if (!source) source = a.kind === "agent" ? "agent" : "reviewer";

    // Detect flip: reviewer disagrees with the agent's original verdict
    const isFlip =
      a.kind === "user" &&
      before.agent_initial_verdict !== null &&
      before.agent_initial_verdict !== input.verdict;
    if (isFlip) source = "flipped";

    db().prepare(
      `UPDATE chains SET
        verdict = ?,
        verdict_source = ?,
        verdict_set_at = datetime('now'),
        verdict_set_by_kind = ?,
        verdict_set_by_id = ?,
        verdict_notes_md = COALESCE(?, verdict_notes_md)
       WHERE id = ?`,
    ).run(input.verdict, source, a.kind, a.id, input.notes ?? null, id);

    // Set the immutable agent_initial_verdict once (on the agent's first call)
    if (a.kind === "agent" && before.agent_initial_verdict === null) {
      db().prepare(
        "UPDATE chains SET agent_initial_verdict = ?, agent_confidence = ? WHERE id = ?",
      ).run(input.verdict, input.agentConfidence ?? null, id);
    }

    audit("chain", id, isFlip ? "verdict_flipped" : "verdict_set", a, {
      from: before.verdict, to: input.verdict, source,
    });

    if (isFlip) {
      const direction =
        before.agent_initial_verdict === "malicious" && input.verdict === "benign"
          ? "flipped_tp_to_fp"
          : before.agent_initial_verdict === "benign" && input.verdict === "malicious"
            ? "flipped_fp_to_tp"
            : "flipped_other";
      recordLabel({
        entityType: "node", // we'll log against chain via entityId
        entityId: id,
        signal: direction as "approved" | "rejected" | "edited" | "verified" | "refuted",
        beforeJson: { agentInitial: before.agent_initial_verdict, prior: before.verdict },
        afterJson: { verdict: input.verdict, notes: input.notes },
        by: a,
      });
    } else if (a.kind === "user") {
      recordLabel({
        entityType: "node",
        entityId: id,
        signal: input.verdict === "inconclusive" ? "refuted" : "approved",
        afterJson: { verdict: input.verdict },
        by: a,
      });
    }

    bumpChainTimestamp(id);
    return c.json({ ok: true, flipped: isFlip, source });
  });

  // Per-node feedback
  app.post("/api/nodes/:nodeId/feedback", async (c) => {
    const nodeId = c.req.param("nodeId");
    const json = await c.req.json().catch(() => null);
    const parsed = zNodeFeedbackInput.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const row = db().prepare("SELECT chain_id FROM chain_nodes WHERE id = ?").get(nodeId) as
      | { chain_id: string } | undefined;
    if (!row) return c.json({ error: "node not found" }, 404);
    const res = db().prepare(
      `INSERT INTO node_feedback (node_id, decision, notes_md, created_by_kind, created_by_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(nodeId, parsed.data.decision, parsed.data.notesMd ?? null, a.kind, a.id);
    audit("node", nodeId, `feedback:${parsed.data.decision}`, a, parsed.data);
    if (parsed.data.decision !== "note_only") {
      recordLabel({
        entityType: "node",
        entityId: nodeId,
        signal:
          parsed.data.decision === "agree" ? "approved" :
          parsed.data.decision === "disagree" ? "rejected" :
          "edited",
        afterJson: { notes: parsed.data.notesMd },
        by: a,
      });
    }
    bumpChainTimestamp(row.chain_id);
    return c.json({ id: Number(res.lastInsertRowid) });
  });

  app.get("/api/nodes/:nodeId/feedback", (c) => {
    const nodeId = c.req.param("nodeId");
    const rows = db().prepare(
      `SELECT id, decision, notes_md, created_at, created_by_kind, created_by_id
       FROM node_feedback WHERE node_id = ? ORDER BY id ASC`,
    ).all(nodeId) as Array<{
      id: number; decision: string; notes_md: string | null;
      created_at: string; created_by_kind: "user" | "agent"; created_by_id: string;
    }>;
    return c.json(rows.map((r) => ({
      id: r.id, decision: r.decision, notesMd: r.notes_md,
      createdAt: r.created_at, createdBy: { kind: r.created_by_kind, id: r.created_by_id },
    })));
  });

  app.post("/api/evidence/:id/feedback", async (c) => {
    const id = c.req.param("id");
    const json = await c.req.json().catch(() => null);
    const parsed = zEvidenceFeedbackInput.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const row = db().prepare(
      "SELECT e.id, n.chain_id FROM evidence e JOIN chain_nodes n ON n.id = e.node_id WHERE e.id = ?",
    ).get(id) as { chain_id: string } | undefined;
    if (!row) return c.json({ error: "evidence not found" }, 404);
    const res = db().prepare(
      `INSERT INTO evidence_feedback (evidence_id, decision, notes_md, created_by_kind, created_by_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, parsed.data.decision, parsed.data.notesMd ?? null, a.kind, a.id);
    audit("evidence", id, `feedback:${parsed.data.decision}`, a, parsed.data);
    if (parsed.data.decision !== "note_only") {
      recordLabel({
        entityType: "evidence",
        entityId: id,
        signal:
          parsed.data.decision === "agree" ? "approved" :
          parsed.data.decision === "disagree" ? "rejected" :
          "edited",
        afterJson: { notes: parsed.data.notesMd },
        by: a,
      });
    }
    bumpChainTimestamp(row.chain_id);
    return c.json({ id: Number(res.lastInsertRowid) });
  });

  app.get("/api/evidence/:id/feedback", (c) => {
    const id = c.req.param("id");
    const rows = db().prepare(
      `SELECT id, decision, notes_md, created_at, created_by_kind, created_by_id
       FROM evidence_feedback WHERE evidence_id = ? ORDER BY id ASC`,
    ).all(id) as Array<{
      id: number; decision: string; notes_md: string | null;
      created_at: string; created_by_kind: "user" | "agent"; created_by_id: string;
    }>;
    return c.json(rows.map((r) => ({
      id: r.id, decision: r.decision, notesMd: r.notes_md,
      createdAt: r.created_at, createdBy: { kind: r.created_by_kind, id: r.created_by_id },
    })));
  });
}
