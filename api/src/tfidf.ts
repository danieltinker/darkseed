// Lightweight TF-IDF index for cross-chain similarity (Phase 4).
// No external embedding model — purely lexical. Provides "show me chains like this one"
// as a retrieval primitive for the agent learning loop.

import { db } from "./db.js";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","by","for","from","with",
  "is","are","was","were","be","been","being","have","has","had","do","does","did",
  "this","that","these","those","it","its","as","into","via","over","under","through",
  "user","app","data","over",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && t.length <= 64 && !STOPWORDS.has(t));
}

function nodeText(nodeId: string): string {
  const d = db();
  const node = d
    .prepare(
      "SELECT title, description, technique_id, technique_name, tactic FROM chain_nodes WHERE id = ?",
    )
    .get(nodeId) as
    | { title: string; description: string; technique_id: string; technique_name: string; tactic: string }
    | undefined;
  if (!node) return "";
  const iocs = d
    .prepare("SELECT type, value FROM iocs WHERE node_id = ?")
    .all(nodeId) as Array<{ type: string; value: string }>;
  const ev = d
    .prepare("SELECT kind, label, value FROM evidence WHERE node_id = ? LIMIT 50")
    .all(nodeId) as Array<{ kind: string; label: string; value: string }>;
  return [
    node.title,
    node.description,
    node.technique_id,
    node.technique_name,
    node.tactic,
    ...iocs.map((i) => `${i.type}:${i.value}`),
    ...ev.map((e) => `${e.kind} ${e.label} ${e.value}`),
  ].join(" ");
}

export function reindexNode(nodeId: string): void {
  const d = db();
  const text = nodeText(nodeId);
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    d.prepare("DELETE FROM node_terms WHERE node_id = ?").run(nodeId);
    return;
  }
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tx = d.transaction(() => {
    d.prepare("DELETE FROM node_terms WHERE node_id = ?").run(nodeId);
    const insTerm = d.prepare("INSERT INTO node_terms (node_id, term, tf) VALUES (?, ?, ?)");
    const upDf = d.prepare(
      `INSERT INTO term_df (term, df) VALUES (?, 1)
       ON CONFLICT(term) DO UPDATE SET df = df + 1`,
    );
    for (const [term, count] of counts) {
      const tf = count / tokens.length;
      insTerm.run(nodeId, term, tf);
      upDf.run(term);
    }
  });
  tx();
}

export function reindexAll(): void {
  const d = db();
  d.prepare("DELETE FROM node_terms").run();
  d.prepare("DELETE FROM term_df").run();
  const nodes = d.prepare("SELECT id FROM chain_nodes").all() as Array<{ id: string }>;
  for (const n of nodes) reindexNode(n.id);
  const total = nodes.length;
  d.prepare(
    `INSERT INTO corpus_meta (key, value) VALUES ('total_nodes', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(total));
}

export function similarNodes(
  nodeId: string,
  limit = 20,
): Array<{ nodeId: string; chainId: string; score: number; title: string; techniqueId: string; category: string; severity: string }> {
  const d = db();
  const qTerms = d
    .prepare("SELECT term, tf FROM node_terms WHERE node_id = ?")
    .all(nodeId) as Array<{ term: string; tf: number }>;
  if (qTerms.length === 0) return [];
  const totalRow = d
    .prepare("SELECT value FROM corpus_meta WHERE key = 'total_nodes'")
    .get() as { value: string } | undefined;
  const N = totalRow ? Number(totalRow.value) : 1000;

  // Compute IDF for query terms, then sum tf*idf*qtf*idf grouped by candidate node
  const placeholders = qTerms.map(() => "?").join(",");
  const dfRows = d
    .prepare(`SELECT term, df FROM term_df WHERE term IN (${placeholders})`)
    .all(...qTerms.map((t) => t.term)) as Array<{ term: string; df: number }>;
  const idf = new Map<string, number>();
  for (const r of dfRows) idf.set(r.term, Math.log(1 + N / (1 + r.df)));
  const queryWeight = new Map<string, number>();
  for (const t of qTerms) queryWeight.set(t.term, t.tf * (idf.get(t.term) ?? 0));

  const candidateRows = d
    .prepare(
      `SELECT node_id, term, tf FROM node_terms
       WHERE term IN (${placeholders}) AND node_id != ?`,
    )
    .all(...qTerms.map((t) => t.term), nodeId) as Array<{ node_id: string; term: string; tf: number }>;

  const scores = new Map<string, number>();
  for (const r of candidateRows) {
    const w = queryWeight.get(r.term) ?? 0;
    const score = r.tf * (idf.get(r.term) ?? 0) * w;
    scores.set(r.node_id, (scores.get(r.node_id) ?? 0) + score);
  }
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (ranked.length === 0) return [];

  const ids = ranked.map(([id]) => id);
  const meta = d
    .prepare(
      `SELECT n.id, n.chain_id, n.title, n.technique_id, c.category, c.severity
       FROM chain_nodes n JOIN chains c ON c.id = n.chain_id
       WHERE n.id IN (${ids.map(() => "?").join(",")})`,
    )
    .all(...ids) as Array<{
    id: string; chain_id: string; title: string; technique_id: string; category: string; severity: string;
  }>;
  const byId = new Map(meta.map((m) => [m.id, m]));
  return ranked
    .map(([id, score]) => {
      const m = byId.get(id);
      if (!m) return null;
      return {
        nodeId: m.id,
        chainId: m.chain_id,
        score: Number(score.toFixed(4)),
        title: m.title,
        techniqueId: m.technique_id,
        category: m.category,
        severity: m.severity,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
