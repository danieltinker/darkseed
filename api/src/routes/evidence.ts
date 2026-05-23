import type { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { audit, bumpChainTimestamp, recordLabel } from "../repo.js";
import { actor } from "../middleware.js";
import { randomUUID } from "node:crypto";
import { storeBlob } from "../blobs.js";
import {
  zDynamicEvidenceInput,
  zStaticEvidenceInput,
  zVerificationInput,
} from "../zod-schemas.js";

export function mountEvidenceRoutes(app: Hono): void {
  // Create evidence (JSON body — no file upload)
  app.post("/api/nodes/:nodeId/evidence", async (c) => {
    const nodeId = c.req.param("nodeId");
    const node = db().prepare("SELECT chain_id FROM chain_nodes WHERE id = ?").get(nodeId) as
      | { chain_id: string }
      | undefined;
    if (!node) return c.json({ error: "node not found" }, 404);
    const json = await c.req.json().catch(() => null);
    const wrapper = z
      .object({
        category: z.enum(["static", "dynamic"]),
        kind: z.string(),
        label: z.string(),
        value: z.string().default(""),
        meta: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
        payload: z.unknown().optional(),
        timestamp: z.number().optional(),
        status: z.enum(["proposed", "accepted", "refuted"]).default("accepted"),
      })
      .safeParse(json);
    if (!wrapper.success) return c.json({ error: wrapper.error.flatten() }, 400);
    const schema = wrapper.data.category === "static" ? zStaticEvidenceInput : zDynamicEvidenceInput;
    const parsed = schema.safeParse({
      kind: wrapper.data.kind,
      label: wrapper.data.label,
      value: wrapper.data.value,
      meta: wrapper.data.meta,
      timestamp: wrapper.data.timestamp,
      payload: wrapper.data.payload,
    });
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO evidence
         (id, node_id, category, kind, label, value, meta_json, payload_json, timestamp_ms,
          status, created_by_kind, created_by_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        nodeId,
        wrapper.data.category,
        parsed.data.kind,
        parsed.data.label,
        parsed.data.value,
        JSON.stringify(parsed.data.meta),
        "payload" in parsed.data ? JSON.stringify(parsed.data.payload) : null,
        parsed.data.timestamp ?? null,
        wrapper.data.status,
        a.kind,
        a.id,
      );
    audit("evidence", id, wrapper.data.status === "proposed" ? "proposed" : "created", a, wrapper.data);
    bumpChainTimestamp(node.chain_id);
    return c.json({ id });
  });

  // Upload a binary blob and attach it as evidence
  app.post("/api/nodes/:nodeId/evidence/upload", async (c) => {
    const nodeId = c.req.param("nodeId");
    const node = db().prepare("SELECT chain_id FROM chain_nodes WHERE id = ?").get(nodeId) as
      | { chain_id: string }
      | undefined;
    if (!node) return c.json({ error: "node not found" }, 404);

    const form = await c.req.formData().catch(() => null);
    if (!form) return c.json({ error: "expected multipart/form-data" }, 400);

    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "missing 'file' field" }, 400);
    const category = (form.get("category") as string) || "dynamic";
    const kind = (form.get("kind") as string) || inferKindFromFile(file);
    const label = (form.get("label") as string) || file.name;
    const status = (form.get("status") as string) || "accepted";

    const buf = Buffer.from(await file.arrayBuffer());
    const stored = storeBlob(buf, { mime: file.type, filename: file.name });

    // For typed kinds, try to compute payload summaries inline
    let payload: unknown = null;
    try {
      if (kind === "har_capture" && file.type.includes("json")) {
        payload = summarizeHar(buf);
      } else if (kind === "frida_trace") {
        payload = summarizeFridaNdjson(buf);
      } else if (kind === "pcap_capture") {
        payload = { totalBytes: buf.length, totalPackets: 0, flows: [], capturedAtIso: new Date().toISOString() };
      } else if (kind === "source_artifact") {
        payload = { language: inferLangFromName(file.name) };
      }
    } catch (err) {
      console.warn("[evidence] payload summary failed:", (err as Error).message);
    }

    const a = actor(c);
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO evidence
         (id, node_id, category, kind, label, value, meta_json, payload_json,
          blob_sha256, blob_mime, blob_size, blob_filename,
          status, created_by_kind, created_by_id)
         VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        nodeId,
        category,
        kind,
        label,
        `${stored.size} bytes — ${file.name}`,
        payload ? JSON.stringify(payload) : null,
        stored.sha256,
        file.type || null,
        stored.size,
        file.name,
        status,
        a.kind,
        a.id,
      );
    audit("evidence", id, "uploaded", a, { kind, filename: file.name, sha256: stored.sha256 });
    bumpChainTimestamp(node.chain_id);
    return c.json({ id, blob: stored, kind, category });
  });

  app.delete("/api/evidence/:id", (c) => {
    const id = c.req.param("id");
    const a = actor(c);
    const row = db()
      .prepare(
        "SELECT e.*, n.chain_id FROM evidence e JOIN chain_nodes n ON e.node_id = n.id WHERE e.id = ?",
      )
      .get(id) as { chain_id: string } | undefined;
    if (!row) return c.json({ error: "not found" }, 404);
    db().prepare("DELETE FROM evidence WHERE id = ?").run(id);
    audit("evidence", id, "deleted", a);
    bumpChainTimestamp(row.chain_id);
    return c.json({ ok: true });
  });

  // Verification update
  app.post("/api/evidence/:id/verify", async (c) => {
    const id = c.req.param("id");
    const json = await c.req.json().catch(() => null);
    const parsed = zVerificationInput.safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const row = db()
      .prepare(
        "SELECT e.*, n.chain_id FROM evidence e JOIN chain_nodes n ON e.node_id = n.id WHERE e.id = ?",
      )
      .get(id) as { chain_id: string } | undefined;
    if (!row) return c.json({ error: "not found" }, 404);
    db()
      .prepare(
        `UPDATE evidence SET verification_status = ?, verification_method = ?,
         verification_by = ?, verification_at = datetime('now') WHERE id = ?`,
      )
      .run(parsed.data.status, parsed.data.method ?? null, `${a.kind}:${a.id}`, id);
    audit("evidence", id, "verified", a, parsed.data);
    recordLabel({
      entityType: "evidence",
      entityId: id,
      signal: parsed.data.status === "confirmed" ? "verified" : "refuted",
      afterJson: parsed.data,
      by: a,
    });
    bumpChainTimestamp(row.chain_id);
    return c.json({ ok: true });
  });

  // Review proposed evidence
  app.post("/api/evidence/:id/review", async (c) => {
    const id = c.req.param("id");
    const json = await c.req.json().catch(() => null);
    const parsed = z.object({ decision: z.enum(["accept", "reject"]) }).safeParse(json);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const a = actor(c);
    const row = db()
      .prepare(
        "SELECT e.*, n.chain_id FROM evidence e JOIN chain_nodes n ON e.node_id = n.id WHERE e.id = ?",
      )
      .get(id) as
      | { chain_id: string; created_by_kind: string; created_by_id: string }
      | undefined;
    if (!row) return c.json({ error: "not found" }, 404);
    const newStatus = parsed.data.decision === "accept" ? "accepted" : "refuted";
    db().prepare("UPDATE evidence SET status = ? WHERE id = ?").run(newStatus, id);
    audit("evidence", id, parsed.data.decision, a);
    recordLabel({
      entityType: "evidence",
      entityId: id,
      signal: parsed.data.decision === "accept" ? "approved" : "rejected",
      sourceAgent: { kind: row.created_by_kind as "agent" | "user", id: row.created_by_id },
      by: a,
    });
    bumpChainTimestamp(row.chain_id);
    return c.json({ ok: true });
  });
}

function inferKindFromFile(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".har") || file.type.includes("har")) return "har_capture";
  if (name.endsWith(".pcap") || name.endsWith(".pcapng")) return "pcap_capture";
  if (name.endsWith(".ndjson") || name.includes("frida")) return "frida_trace";
  if (/\.(java|smali|js|ts|kt|swift|py|c|cpp|h|sh|html|xml)$/.test(name)) return "source_artifact";
  if (file.type.startsWith("image/")) return "ui_capture";
  return "string_artifact";
}

function inferLangFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return "text";
  const ext = m[1]!;
  const map: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    java: "java",
    smali: "smali",
    kt: "kotlin",
    swift: "swift",
    py: "python",
    sh: "shell",
    html: "html",
    xml: "xml",
    json: "json",
    c: "c",
    cpp: "cpp",
    h: "c",
  };
  return map[ext] ?? ext;
}

function summarizeHar(buf: Buffer): unknown {
  const har = JSON.parse(buf.toString("utf8"));
  const entries = (har.log?.entries ?? []) as Array<Record<string, unknown>>;
  return {
    entries: entries.slice(0, 200).map((e) => {
      const req = e.request as Record<string, unknown>;
      const res = e.response as Record<string, unknown>;
      const url = String(req?.url ?? "");
      let host = "";
      try { host = new URL(url).hostname; } catch { /* ignore */ }
      return {
        method: String(req?.method ?? ""),
        url,
        host,
        status: Number(res?.status ?? 0),
        mime: (res?.content as Record<string, unknown> | undefined)?.mimeType as string | undefined,
        requestBytes: Number((req as Record<string, unknown>)?.bodySize ?? 0),
        responseBytes: Number((res?.content as Record<string, unknown> | undefined)?.size ?? 0),
        durationMs: Number(e.time ?? 0),
        startedAt: String(e.startedDateTime ?? ""),
      };
    }),
  };
}

function summarizeFridaNdjson(buf: Buffer): unknown {
  const events: Array<Record<string, unknown>> = [];
  const lines = buf.toString("utf8").split("\n");
  for (const ln of lines) {
    const s = ln.trim();
    if (!s) continue;
    try {
      const obj = JSON.parse(s);
      events.push(obj);
      if (events.length >= 2000) break;
    } catch {
      /* ignore non-json lines */
    }
  }
  return { events };
}
