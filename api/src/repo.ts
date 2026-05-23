import { db } from "./db.js";
import type {
  Actor,
  Chain,
  ChainEdge,
  ChainNode,
  ChainSummary,
  Category,
  Evidence,
  IOC,
  IndexResponse,
  Severity,
  Status,
} from "./types.js";

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function buildIndex(): IndexResponse {
  const d = db();
  const chains = d
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM chain_nodes WHERE chain_id = c.id) AS node_count
       FROM chains c
       WHERE c.status != 'archived'
       ORDER BY c.severity_score DESC, c.id`,
    )
    .all() as Row[];

  const byCategory: Record<Category, number> = { riskware: 0, toll_fraud: 0, phishing: 0 };
  const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const families = new Set<string>();
  const sources = new Set<string>();

  const summaries: ChainSummary[] = chains.map((r) => {
    const cat = r.category as Category;
    const sev = r.severity as Severity;
    byCategory[cat]++;
    bySeverity[sev]++;
    families.add(r.family as string);
    sources.add(r.source as string);
    const tags = JSON.parse((r.tags_json as string) ?? "[]") as string[];
    return {
      id: r.id as string,
      category: cat,
      family: r.family as string,
      source: r.source as string,
      firstSeen: r.first_seen as string,
      severity: sev,
      severityScore: r.severity_score as number,
      summary: r.summary as string,
      tags,
      nodeCount: r.node_count as number,
      seedIocValue: r.seed_ioc_value as string,
      seedIocType: r.seed_ioc_type as IOC["type"],
      status: r.status as Status,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    total: summaries.length,
    byCategory,
    bySeverity,
    families: [...families].sort(),
    sources: [...sources].sort(),
    chains: summaries,
  };
}

export function loadChain(id: string): Chain | null {
  const d = db();
  const c = d.prepare("SELECT * FROM chains WHERE id = ?").get(id) as Row | undefined;
  if (!c) return null;

  const nodeRows = d
    .prepare("SELECT * FROM chain_nodes WHERE chain_id = ? ORDER BY step, id")
    .all(id) as Row[];
  const iocRows = d
    .prepare(
      "SELECT i.* FROM iocs i JOIN chain_nodes n ON i.node_id = n.id WHERE n.chain_id = ?",
    )
    .all(id) as Row[];
  const evRows = d
    .prepare(
      "SELECT e.* FROM evidence e JOIN chain_nodes n ON e.node_id = n.id WHERE n.chain_id = ?",
    )
    .all(id) as Row[];
  const edgeRows = d
    .prepare("SELECT from_node, to_node, label FROM chain_edges WHERE chain_id = ?")
    .all(id) as Row[];

  const iocsByNode = new Map<string, IOC[]>();
  for (const r of iocRows) {
    const nid = r.node_id as string;
    const list = iocsByNode.get(nid) ?? [];
    list.push({
      type: r.type as IOC["type"],
      value: r.value as string,
      source: (r.source as string | null) ?? undefined,
    });
    iocsByNode.set(nid, list);
  }

  const evByNode = new Map<string, Evidence[]>();
  for (const r of evRows) {
    const nid = r.node_id as string;
    const list = evByNode.get(nid) ?? [];
    list.push(rowToEvidence(r));
    evByNode.set(nid, list);
  }

  const nodes: ChainNode[] = nodeRows.map((r) => ({
    id: r.id as string,
    chainId: r.chain_id as string,
    step: r.step as number,
    techniqueId: r.technique_id as string,
    techniqueName: r.technique_name as string,
    tactic: r.tactic as ChainNode["tactic"],
    title: r.title as string,
    description: r.description as string,
    iocs: iocsByNode.get(r.id as string) ?? [],
    evidence: evByNode.get(r.id as string) ?? [],
    agentNotes: {
      staticAgent: (r.static_agent_note as string | null) ?? undefined,
      dynamicAgent: (r.dynamic_agent_note as string | null) ?? undefined,
    },
    status: r.status as Status,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    createdBy: { kind: r.created_by_kind as Actor["kind"], id: r.created_by_id as string },
  }));

  const edges: ChainEdge[] = edgeRows.map((r) => ({
    from: r.from_node as string,
    to: r.to_node as string,
    label: (r.label as string | null) ?? null,
  }));

  return {
    id: c.id as string,
    category: c.category as Category,
    family: c.family as string,
    source: c.source as string,
    seedIoc: {
      type: c.seed_ioc_type as IOC["type"],
      value: c.seed_ioc_value as string,
      source: c.source as string,
    },
    firstSeen: c.first_seen as string,
    severity: c.severity as Severity,
    severityScore: c.severity_score as number,
    summary: c.summary as string,
    tags: JSON.parse((c.tags_json as string) ?? "[]"),
    nodes,
    edges,
    status: c.status as Status,
    createdAt: c.created_at as string,
    updatedAt: c.updated_at as string,
    createdBy: { kind: c.created_by_kind as Actor["kind"], id: c.created_by_id as string },
    verdict: {
      verdict: ((c.verdict as string) ?? "pending") as Chain["verdict"]["verdict"],
      source: (c.verdict_source as Chain["verdict"]["source"]) ?? null,
      setAt: (c.verdict_set_at as string | null) ?? null,
      setBy:
        c.verdict_set_by_id
          ? { kind: c.verdict_set_by_kind as Actor["kind"], id: c.verdict_set_by_id as string }
          : null,
      notesMd: (c.verdict_notes_md as string | null) ?? null,
      agentInitial: (c.agent_initial_verdict as Chain["verdict"]["agentInitial"]) ?? null,
      agentConfidence: (c.agent_confidence as number | null) ?? null,
    },
    appId: (c.app_id as string | null) ?? null,
    sourceReportId: (c.source_report_id as string | null) ?? null,
  };
}

function rowToEvidence(r: Row): Evidence {
  const base = {
    id: r.id as string,
    nodeId: r.node_id as string,
    label: r.label as string,
    value: r.value as string,
    meta: JSON.parse((r.meta_json as string) ?? "{}"),
    payload: r.payload_json ? JSON.parse(r.payload_json as string) : undefined,
    blob:
      r.blob_sha256
        ? {
            sha256: r.blob_sha256 as string,
            size: (r.blob_size as number) ?? 0,
            mime: (r.blob_mime as string | null) ?? undefined,
            filename: (r.blob_filename as string | null) ?? undefined,
          }
        : null,
    timestamp: (r.timestamp_ms as number | null) ?? undefined,
    verification: r.verification_status
      ? {
          status: r.verification_status as "pending" | "confirmed" | "refuted" | "inconclusive",
          method: (r.verification_method as string | null) ?? undefined,
          by: (r.verification_by as string | null) ?? undefined,
          at: (r.verification_at as string | null) ?? undefined,
        }
      : null,
    status: r.status as Status,
    createdAt: r.created_at as string,
    createdBy: { kind: r.created_by_kind as Actor["kind"], id: r.created_by_id as string },
  };
  if (r.category === "static") {
    return { ...base, category: "static", kind: r.kind as Evidence["kind"] } as Evidence;
  }
  return { ...base, category: "dynamic", kind: r.kind as Evidence["kind"] } as Evidence;
}

// ---------------------------------------------------------------------------
// Audit + label helpers
// ---------------------------------------------------------------------------

export function audit(
  entityType: "chain" | "node" | "evidence" | "edge" | "comment",
  entityId: string,
  action: string,
  actor: Actor,
  diff?: unknown,
): void {
  db()
    .prepare(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_kind, actor_id, diff_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(entityType, entityId, action, actor.kind, actor.id, diff ? JSON.stringify(diff) : null);
}

export function recordLabel(args: {
  entityType: "node" | "evidence";
  entityId: string;
  signal: "approved" | "rejected" | "edited" | "verified" | "refuted";
  beforeJson?: unknown;
  afterJson?: unknown;
  sourceAgent?: Actor;
  by: Actor;
}): void {
  db()
    .prepare(
      `INSERT INTO labels (entity_type, entity_id, signal, before_json, after_json,
                           source_agent_kind, source_agent_id,
                           created_by_kind, created_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.entityType,
      args.entityId,
      args.signal,
      args.beforeJson ? JSON.stringify(args.beforeJson) : null,
      args.afterJson ? JSON.stringify(args.afterJson) : null,
      args.sourceAgent?.kind ?? null,
      args.sourceAgent?.id ?? null,
      args.by.kind,
      args.by.id,
    );
}

export function bumpChainTimestamp(chainId: string): void {
  db().prepare("UPDATE chains SET updated_at = datetime('now') WHERE id = ?").run(chainId);
}
