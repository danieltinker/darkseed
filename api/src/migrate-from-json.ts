import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { db, DATA_DIR } from "./db.js";

interface JsonChain {
  id: string;
  category: "riskware" | "toll_fraud" | "phishing";
  family: string;
  source: string;
  seedIoc: { type: string; value: string; source?: string };
  firstSeen: string;
  severity: "low" | "medium" | "high" | "critical";
  severityScore: number;
  summary: string;
  tags: string[];
  nodes: Array<{
    id: string;
    step: number;
    techniqueId: string;
    techniqueName: string;
    tactic: string;
    title: string;
    description: string;
    iocs: Array<{ type: string; value: string; source?: string }>;
    evidence: {
      static: Array<{ kind: string; label: string; value: string; meta?: Record<string, unknown> }>;
      dynamic: Array<{
        kind: string;
        label: string;
        value: string;
        timestamp: number;
        meta?: Record<string, unknown>;
      }>;
    };
    agentNotes: { staticAgent: string; dynamicAgent: string };
  }>;
  edges: Array<{ from: string; to: string; label?: string }>;
}

const CHAINS_DIR = resolve(DATA_DIR, "chains");

function main() {
  if (!existsSync(CHAINS_DIR)) {
    console.error(`[migrate] ${CHAINS_DIR} not found — run "pnpm generate" first.`);
    process.exit(1);
  }

  const d = db();

  const files = readdirSync(CHAINS_DIR).filter((f) => f.endsWith(".json")).sort();
  console.log(`[migrate] found ${files.length} chain JSON files`);

  const existing = d.prepare("SELECT COUNT(*) AS n FROM chains").get() as { n: number };
  if (existing.n > 0) {
    console.log(`[migrate] DB already has ${existing.n} chains — wiping for fresh import`);
    const wipe = d.transaction(() => {
      d.prepare("DELETE FROM evidence").run();
      d.prepare("DELETE FROM iocs").run();
      d.prepare("DELETE FROM chain_edges").run();
      d.prepare("DELETE FROM chain_nodes").run();
      d.prepare("DELETE FROM chains").run();
      d.prepare("DELETE FROM node_terms").run();
      d.prepare("DELETE FROM term_df").run();
      d.prepare("DELETE FROM corpus_meta").run();
    });
    wipe();
  }

  const insChain = d.prepare(
    `INSERT INTO chains
     (id, category, family, source, seed_ioc_type, seed_ioc_value,
      first_seen, severity, severity_score, summary, tags_json,
      created_by_kind, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent', 'generator')`,
  );
  const insNode = d.prepare(
    `INSERT INTO chain_nodes
     (id, chain_id, step, technique_id, technique_name, tactic, title, description,
      static_agent_note, dynamic_agent_note,
      created_by_kind, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent', 'generator')`,
  );
  const insEdge = d.prepare(
    `INSERT INTO chain_edges (chain_id, from_node, to_node, label) VALUES (?, ?, ?, ?)`,
  );
  const insIoc = d.prepare(
    `INSERT INTO iocs (node_id, type, value, source) VALUES (?, ?, ?, ?)`,
  );
  const insEvidence = d.prepare(
    `INSERT INTO evidence
     (id, node_id, category, kind, label, value, meta_json, timestamp_ms,
      created_by_kind, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agent', 'generator')`,
  );

  const tx = d.transaction((all: JsonChain[]) => {
    for (const c of all) {
      insChain.run(
        c.id,
        c.category,
        c.family,
        c.source,
        c.seedIoc.type,
        c.seedIoc.value,
        c.firstSeen,
        c.severity,
        c.severityScore,
        c.summary,
        JSON.stringify(c.tags ?? []),
      );
      for (const n of c.nodes) {
        insNode.run(
          n.id,
          c.id,
          n.step,
          n.techniqueId,
          n.techniqueName,
          n.tactic,
          n.title,
          n.description,
          n.agentNotes?.staticAgent ?? null,
          n.agentNotes?.dynamicAgent ?? null,
        );
        for (const i of n.iocs ?? []) {
          insIoc.run(n.id, i.type, i.value, i.source ?? null);
        }
        for (const ev of n.evidence?.static ?? []) {
          insEvidence.run(
            randomUUID(),
            n.id,
            "static",
            ev.kind,
            ev.label,
            ev.value,
            JSON.stringify(ev.meta ?? {}),
            null,
          );
        }
        for (const ev of n.evidence?.dynamic ?? []) {
          insEvidence.run(
            randomUUID(),
            n.id,
            "dynamic",
            ev.kind,
            ev.label,
            ev.value,
            JSON.stringify(ev.meta ?? {}),
            ev.timestamp ?? null,
          );
        }
      }
      for (const e of c.edges ?? []) {
        insEdge.run(c.id, e.from, e.to, e.label ?? null);
      }
    }
  });

  const batch: JsonChain[] = [];
  const BATCH_SIZE = 100;
  let done = 0;
  for (const f of files) {
    const raw = readFileSync(resolve(CHAINS_DIR, f), "utf8");
    batch.push(JSON.parse(raw) as JsonChain);
    if (batch.length >= BATCH_SIZE) {
      tx(batch);
      done += batch.length;
      console.log(`[migrate] imported ${done}/${files.length}`);
      batch.length = 0;
    }
  }
  if (batch.length) {
    tx(batch);
    done += batch.length;
  }

  // FTS sync
  d.prepare("DELETE FROM chains_fts").run();
  d.prepare(
    `INSERT INTO chains_fts (id, family, summary, tags, seed_ioc_value)
     SELECT id, family, summary, tags_json, seed_ioc_value FROM chains`,
  ).run();

  console.log(`[migrate] DONE — ${done} chains imported`);
  console.log(`[migrate] DB: ${db().prepare("SELECT COUNT(*) AS n FROM chains").get()}`);
}

main();
