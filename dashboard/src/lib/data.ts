import type { Chain, ChainSummary, Index } from "./types";

const API = "/api";

let indexCache: Index | null = null;
const chainCache = new Map<string, Chain>();

function actorHeaders(): HeadersInit {
  // For now, single-user mode. Wire to a settings panel later.
  return {
    "x-actor-kind": "user",
    "x-actor-id": "researcher",
  };
}

export async function loadIndex(force = false): Promise<Index> {
  if (indexCache && !force) return indexCache;
  const res = await fetch(`${API}/index`);
  if (!res.ok) {
    throw new Error(
      `Could not load /api/index (HTTP ${res.status}). Is the api running? "pnpm api:dev"`,
    );
  }
  const json = (await res.json()) as Index;
  indexCache = json;
  return json;
}

export async function loadChain(id: string, force = false): Promise<Chain> {
  if (!force) {
    const cached = chainCache.get(id);
    if (cached) return cached;
  }
  const res = await fetch(`${API}/chains/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Could not load chain ${id} (HTTP ${res.status})`);
  const chain = (await res.json()) as Chain;
  chainCache.set(id, chain);
  return chain;
}

export function invalidateChain(id: string): void {
  chainCache.delete(id);
}

export function invalidateIndex(): void {
  indexCache = null;
}

// --- Mutations (Phase 2+) ----------------------------------------------------

export async function createNode(
  chainId: string,
  input: {
    techniqueId: string;
    techniqueName: string;
    tactic: string;
    title: string;
    description?: string;
    after?: string;
    status?: "proposed" | "accepted";
  },
): Promise<{ id: string; step: number }> {
  const res = await fetch(`${API}/chains/${encodeURIComponent(chainId)}/nodes`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errText(res));
  invalidateChain(chainId);
  invalidateIndex();
  return res.json();
}

export async function updateNode(
  chainId: string,
  nodeId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(
    `${API}/chains/${encodeURIComponent(chainId)}/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", ...actorHeaders() },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(await errText(res));
  invalidateChain(chainId);
}

export async function deleteNode(chainId: string, nodeId: string): Promise<void> {
  const res = await fetch(
    `${API}/chains/${encodeURIComponent(chainId)}/nodes/${encodeURIComponent(nodeId)}`,
    { method: "DELETE", headers: actorHeaders() },
  );
  if (!res.ok) throw new Error(await errText(res));
  invalidateChain(chainId);
}

export async function createEdge(chainId: string, from: string, to: string): Promise<void> {
  const res = await fetch(`${API}/chains/${encodeURIComponent(chainId)}/edges`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) throw new Error(await errText(res));
  invalidateChain(chainId);
}

export async function deleteEdge(chainId: string, from: string, to: string): Promise<void> {
  const res = await fetch(`${API}/chains/${encodeURIComponent(chainId)}/edges`, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) throw new Error(await errText(res));
  invalidateChain(chainId);
}

export async function uploadEvidence(
  nodeId: string,
  file: File,
  opts: { category?: string; kind?: string; label?: string; status?: string } = {},
): Promise<{ id: string; kind: string; category: string }> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts.category) fd.append("category", opts.category);
  if (opts.kind) fd.append("kind", opts.kind);
  if (opts.label) fd.append("label", opts.label);
  if (opts.status) fd.append("status", opts.status);
  const res = await fetch(`${API}/nodes/${encodeURIComponent(nodeId)}/evidence/upload`, {
    method: "POST",
    body: fd,
    headers: actorHeaders(),
  });
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function createEvidenceJson(nodeId: string, body: unknown): Promise<{ id: string }> {
  const res = await fetch(`${API}/nodes/${encodeURIComponent(nodeId)}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function verifyEvidence(
  evidenceId: string,
  status: "pending" | "confirmed" | "refuted" | "inconclusive",
  method?: string,
): Promise<void> {
  const res = await fetch(`${API}/evidence/${encodeURIComponent(evidenceId)}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify({ status, method }),
  });
  if (!res.ok) throw new Error(await errText(res));
}

export async function deleteEvidence(evidenceId: string): Promise<void> {
  const res = await fetch(`${API}/evidence/${encodeURIComponent(evidenceId)}`, {
    method: "DELETE",
    headers: actorHeaders(),
  });
  if (!res.ok) throw new Error(await errText(res));
}

export async function reviewNode(nodeId: string, decision: "accept" | "reject"): Promise<void> {
  const res = await fetch(`${API}/nodes/${encodeURIComponent(nodeId)}/review`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) throw new Error(await errText(res));
}

export async function reviewEvidence(id: string, decision: "accept" | "reject"): Promise<void> {
  const res = await fetch(`${API}/evidence/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) throw new Error(await errText(res));
}

export async function loadComments(nodeId: string): Promise<Array<{
  id: number; nodeId: string; bodyMd: string; createdAt: string;
  createdBy: { kind: "user" | "agent"; id: string };
}>> {
  const res = await fetch(`${API}/nodes/${encodeURIComponent(nodeId)}/comments`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function postComment(nodeId: string, bodyMd: string): Promise<void> {
  const res = await fetch(`${API}/nodes/${encodeURIComponent(nodeId)}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify({ bodyMd }),
  });
  if (!res.ok) throw new Error(await errText(res));
}

export async function loadQueue(): Promise<{
  nodes: Array<{ id: string; chainId: string; nodeId: string; summary: string; proposedBy: { kind: string; id: string }; proposedAt: string; chainFamily: string; chainCategory: string; title: string; tactic: string; techniqueId: string }>;
  evidence: Array<{ id: string; chainId: string; nodeId: string; summary: string; kind: string; evCategory: string; label: string; value: string; proposedBy: { kind: string; id: string }; proposedAt: string; chainFamily: string }>;
}> {
  const res = await fetch(`${API}/queue`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function loadSimilar(nodeId: string): Promise<{
  nodeId: string;
  results: Array<{ nodeId: string; chainId: string; score: number; title: string; techniqueId: string; category: string; severity: string }>;
}> {
  const res = await fetch(`${API}/similar/${encodeURIComponent(nodeId)}?limit=10`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function loadAudit(entityType: string, entityId: string): Promise<Array<{
  id: number; entityType: string; entityId: string; action: string;
  actor: { kind: "user" | "agent"; id: string }; diff?: unknown; createdAt: string;
}>> {
  const res = await fetch(`${API}/audit?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function loadStats(): Promise<Record<string, number>> {
  const res = await fetch(`${API}/export/stats`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export function blobUrl(sha256: string, opts: { download?: boolean } = {}): string {
  return `${API}/blobs/${sha256}${opts.download ? "?download=1" : ""}`;
}

async function errText(res: Response): Promise<string> {
  try {
    const j = await res.json() as { error?: unknown };
    return typeof j.error === "string" ? j.error : JSON.stringify(j.error);
  } catch {
    return `HTTP ${res.status}`;
  }
}

// --- Phase 6: verdict + feedback -------------------------------------------

export async function setVerdict(
  chainId: string,
  body: { verdict: "pending" | "malicious" | "benign" | "inconclusive"; notes?: string; agentConfidence?: number },
): Promise<{ ok: boolean; flipped: boolean; source: string }> {
  const res = await fetch(`${API}/chains/${encodeURIComponent(chainId)}/verdict`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errText(res));
  invalidateChain(chainId);
  invalidateIndex();
  return res.json();
}

export async function postNodeFeedback(
  nodeId: string,
  body: { decision: "agree" | "disagree" | "edit" | "note_only"; notesMd?: string },
): Promise<void> {
  const res = await fetch(`${API}/nodes/${encodeURIComponent(nodeId)}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errText(res));
}

export async function getNodeFeedback(nodeId: string): Promise<Array<{
  id: number; decision: string; notesMd: string | null;
  createdAt: string; createdBy: { kind: "user" | "agent"; id: string };
}>> {
  const res = await fetch(`${API}/nodes/${encodeURIComponent(nodeId)}/feedback`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function postEvidenceFeedback(
  evidenceId: string,
  body: { decision: "agree" | "disagree" | "edit" | "note_only"; notesMd?: string },
): Promise<void> {
  const res = await fetch(`${API}/evidence/${encodeURIComponent(evidenceId)}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errText(res));
}

export async function getEvidenceFeedback(evidenceId: string): Promise<Array<{
  id: number; decision: string; notesMd: string | null;
  createdAt: string; createdBy: { kind: "user" | "agent"; id: string };
}>> {
  const res = await fetch(`${API}/evidence/${encodeURIComponent(evidenceId)}/feedback`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

// --- Phase 7: KB -----------------------------------------------------------

export async function loadKb(opts: { polarity?: string; type?: string; q?: string } = {}): Promise<{
  counts: { benign: number; malicious: number };
  items: Array<import("./types").Indicator>;
}> {
  const qs = new URLSearchParams();
  if (opts.polarity) qs.set("polarity", opts.polarity);
  if (opts.type) qs.set("type", opts.type);
  if (opts.q) qs.set("q", opts.q);
  const res = await fetch(`${API}/kb?${qs.toString()}`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function promoteIoc(body: {
  type: string;
  value: string;
  polarity: "benign" | "malicious";
  category?: string;
  notesMd?: string;
}): Promise<{ id: number; created: boolean; flipped: boolean }> {
  const res = await fetch(`${API}/kb`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function deleteIndicator(id: number): Promise<void> {
  const res = await fetch(`${API}/kb/${id}`, { method: "DELETE", headers: actorHeaders() });
  if (!res.ok) throw new Error(await errText(res));
}

// --- Phase 8: reports ------------------------------------------------------

export async function loadReports(opts: { flipped?: boolean; status?: string; q?: string } = {}): Promise<{
  counts: { total: number; pending: number; ingested: number; flipped: number };
  items: Array<import("./types").Report>;
}> {
  const qs = new URLSearchParams();
  if (opts.flipped) qs.set("flipped", "1");
  if (opts.status) qs.set("status", opts.status);
  if (opts.q) qs.set("q", opts.q);
  const res = await fetch(`${API}/reports?${qs.toString()}`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function loadReport(id: string): Promise<{
  report: import("./types").Report;
  bodyMd: string | null;
}> {
  const res = await fetch(`${API}/reports/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function ingestReportContent(content: string, filename?: string): Promise<{
  reportId: string; chainId: string; appId: string | null;
  nodeCount: number; iocCount: number; created: boolean;
}> {
  const res = await fetch(`${API}/reports/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify({ content, filename }),
  });
  if (!res.ok) throw new Error(await errText(res));
  return res.json();
}

export async function labelReport(
  id: string,
  body: { effectiveLabel: "tp" | "fp"; notesMd?: string },
): Promise<{ ok: boolean; flipped: boolean }> {
  const res = await fetch(`${API}/reports/${encodeURIComponent(id)}/label`, {
    method: "POST",
    headers: { "content-type": "application/json", ...actorHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errText(res));
  invalidateIndex();
  return res.json();
}

// Re-export ChainSummary type for callers
export type { ChainSummary };
