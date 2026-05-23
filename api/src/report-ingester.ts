// Rule-based v1 report ingester.
// Parses YAML frontmatter (very small subset — no external dep), extracts IOC
// patterns, looks for MITRE technique ids, builds a proposed chain.
// LLM-based extraction comes later; this gives us a working end-to-end loop now.

import { createHash, randomUUID } from "node:crypto";
import { db } from "./db.js";
import { storeBlob } from "./blobs.js";
import { audit, bumpChainTimestamp, loadChain } from "./repo.js";
import { kbLookup } from "./kb.js";
import type { Actor, Category, IndicatorType, IOC, Tactic } from "./types.js";
import { reindexNode } from "./tfidf.js";

interface Frontmatter {
  id?: string;
  category?: Category;
  declared_label?: "tp" | "fp" | null;
  source?: string;
  first_seen?: string;
  tags?: string[];
  app?: {
    package_name?: string;
    version_name?: string;
    version_code?: number;
    apk_sha256?: string;
    artifact_id?: string;
  };
}

interface ParsedReport {
  frontmatter: Frontmatter;
  body: string;
  raw: string;
}

// ---------------------------------------------------------------------------
// Minimal YAML-frontmatter parser. We only need a flat dict + nested 'app'.
// ---------------------------------------------------------------------------

export function parseReport(raw: string): ParsedReport {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: raw, raw };
  const yaml = m[1]!;
  const body = m[2] ?? "";
  const fm: Frontmatter = {};
  let currentParent: keyof Frontmatter | null = null;
  const lines = yaml.split("\n");
  for (const ln of lines) {
    if (!ln.trim() || ln.trim().startsWith("#")) continue;
    const indentMatch = ln.match(/^(\s*)(\S.*)$/);
    if (!indentMatch) continue;
    const indent = indentMatch[1]!.length;
    const rest = indentMatch[2]!;
    const colon = rest.indexOf(":");
    if (colon < 0) continue;
    const key = rest.slice(0, colon).trim();
    const valRaw = rest.slice(colon + 1).trim();

    if (indent === 0) {
      currentParent = null;
      if (valRaw === "" || valRaw === "{}") {
        currentParent = key as keyof Frontmatter;
        (fm as Record<string, unknown>)[key] = {};
        continue;
      }
      (fm as Record<string, unknown>)[key] = parseScalar(valRaw);
    } else if (indent >= 2 && currentParent) {
      const parent = (fm as Record<string, unknown>)[currentParent] as Record<string, unknown>;
      parent[key] = parseScalar(valRaw);
    }
  }
  return { frontmatter: fm, body, raw };
}

function parseScalar(v: string): unknown {
  if (v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^\[.*\]$/.test(v)) {
    return v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  if (/^["'].*["']$/.test(v)) return v.slice(1, -1);
  const n = Number(v);
  if (!Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(v)) return n;
  return v;
}

// ---------------------------------------------------------------------------
// IOC + technique extraction
// ---------------------------------------------------------------------------

const RX = {
  technique: /\bT\d{4}(?:\.\d{3})?\b/g,
  sha256: /\b[a-f0-9]{64}\b/gi,
  md5: /\b[a-f0-9]{32}\b/gi,
  url: /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,)]/g,
  domain: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,12})\b/gi,
  ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  package: /\b(?:com|org|net|io|app|de|cn|ru)\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){1,5}\b/g,
};

const TECH_TO_TACTIC: Record<string, Tactic> = {
  T1566: "Initial Access", T1660: "Initial Access", T1475: "Initial Access", T1476: "Initial Access",
  T1204: "Execution", T1407: "Defense Evasion", T1027: "Defense Evasion", T1582: "Defense Evasion",
  T1626: "Privilege Escalation", T1424: "Privilege Escalation",
  T1417: "Credential Access", T1621: "Credential Access", T1056: "Credential Access", T1414: "Credential Access",
  T1429: "Collection", T1430: "Collection", T1517: "Collection", T1636: "Collection",
  T1437: "Command and Control", T1571: "Command and Control",
  T1041: "Exfiltration", T1646: "Exfiltration",
  T1448: "Impact", T1657: "Impact", T1646: "Exfiltration" as Tactic, // duplicate ok
  T1453: "Persistence", T1624: "Persistence",
  T1583: "Resource Development", T1608: "Resource Development",
  T1422: "Discovery",
};

interface Extracted {
  techniques: Array<{ id: string; tactic: Tactic }>;
  iocs: IOC[];
}

export function extractFromBody(body: string): Extracted {
  const techIds = new Set<string>();
  for (const m of body.matchAll(RX.technique)) {
    techIds.add(m[0].toUpperCase());
  }
  const techniques = [...techIds].map((id) => ({
    id,
    tactic: TECH_TO_TACTIC[id.split(".")[0]!] ?? ("Execution" as Tactic),
  }));

  const iocs: IOC[] = [];
  const seen = new Set<string>();
  const add = (type: IOC["type"], value: string) => {
    const k = `${type}|${value.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    iocs.push({ type, value, source: "report-ingester" });
  };

  for (const m of body.matchAll(RX.sha256)) add("sha256", m[0]);
  for (const m of body.matchAll(RX.md5)) {
    // skip if already a sha256 prefix
    if (!body.includes(m[0] + m[0])) add("md5", m[0]);
  }
  for (const m of body.matchAll(RX.url)) add("url", m[0]);
  for (const m of body.matchAll(RX.package)) add("package", m[0]);
  for (const m of body.matchAll(RX.ip)) add("ip", m[0]);
  for (const m of body.matchAll(RX.domain)) {
    // dedupe trivial matches that are part of URLs we already captured
    if (iocs.some((i) => i.type === "url" && i.value.includes(m[0]))) continue;
    add("domain", m[0]);
  }
  return { techniques, iocs };
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

const TECH_NAMES: Record<string, string> = {
  T1566: "Phishing", T1660: "Phishing (Mobile)",
  T1475: "Deliver via Authorized App Store", T1476: "Deliver via Other Means",
  T1204: "User Execution", T1417: "Input Capture (Mobile)",
  T1626: "Abuse Elevation Control Mechanism", T1429: "Audio Capture",
  T1430: "Location Tracking", T1517: "Access Notifications",
  T1636: "Protected User Data", T1437: "App Layer Protocol",
  T1646: "Exfiltration Over C2 Channel", T1041: "Exfiltration Over C2 Channel",
  T1448: "Carrier Billing Fraud", T1657: "Financial Theft",
  T1582: "SMS Control", T1407: "Download New Code at Runtime",
  T1453: "Abuse of Accessibility Services", T1624: "Event Triggered Execution",
  T1422: "System Information Discovery", T1056: "Input Capture",
  T1621: "MFA Request Generation", T1027: "Obfuscated Files or Information",
  T1583: "Acquire Infrastructure",
};

export interface IngestResult {
  reportId: string;
  chainId: string;
  appId: string | null;
  nodeCount: number;
  iocCount: number;
  contentHash: string;
  created: boolean; // false on idempotent re-ingest
  flippedChain: boolean; // if re-ingested and verdict changed
}

export async function ingestReport(args: {
  raw: string;
  sourcePath?: string;
  filename?: string;
  by?: Actor;
}): Promise<IngestResult> {
  const by: Actor = args.by ?? { kind: "agent", id: "report-ingester" };
  const parsed = parseReport(args.raw);
  const fm = parsed.frontmatter;
  const contentHash = createHash("sha256").update(parsed.body).digest("hex");

  // Idempotent re-ingest: if a report with the same id OR same content_hash exists, re-link, don't duplicate.
  const reportId = (fm.id as string | undefined) ?? `report-${randomUUID().slice(0, 8)}`;
  const existing = db()
    .prepare("SELECT id, ingested_chain_id, content_hash FROM reports WHERE id = ? OR content_hash = ?")
    .get(reportId, contentHash) as { id: string; ingested_chain_id: string | null; content_hash: string } | undefined;

  if (existing && existing.content_hash === contentHash) {
    // Same content — no-op
    return {
      reportId: existing.id,
      chainId: existing.ingested_chain_id ?? "",
      appId: null,
      nodeCount: 0,
      iocCount: 0,
      contentHash,
      created: false,
      flippedChain: false,
    };
  }

  // Body stored once in blob (immutable, deduped by sha)
  const bodyBlob = storeBlob(Buffer.from(args.raw, "utf8"), {
    mime: "text/markdown",
    filename: args.filename ?? `${reportId}.md`,
  });

  // App row (if frontmatter mentions one)
  let appId: string | null = null;
  const a = fm.app;
  if (a?.apk_sha256) {
    appId = a.apk_sha256;
    db().prepare(
      `INSERT OR IGNORE INTO apps (id, artifact_id, package_name, version_name, version_code, apk_sha256, source)
       VALUES (?, ?, ?, ?, ?, ?, 'report')`,
    ).run(appId, a.artifact_id ?? a.package_name ?? null, a.package_name ?? null,
          a.version_name ?? null, a.version_code ?? null, a.apk_sha256);
  }

  // Extract structured signal
  const extracted = extractFromBody(parsed.body);

  // KB pre-classification: count how many extracted IOCs hit which polarity
  let kbBenign = 0; let kbMalicious = 0;
  for (const ioc of extracted.iocs) {
    const hit = kbLookup(ioc.type as IndicatorType, ioc.value);
    if (hit?.polarity === "benign") kbBenign++;
    if (hit?.polarity === "malicious") kbMalicious++;
  }

  // Initial verdict guess
  let initialVerdict: "malicious" | "benign" | "inconclusive" = "inconclusive";
  if (fm.declared_label === "tp" || kbMalicious > kbBenign + 1) initialVerdict = "malicious";
  else if (fm.declared_label === "fp" || (kbBenign > 0 && kbMalicious === 0)) initialVerdict = "benign";

  const category: Category = (fm.category as Category) ?? "riskware";
  const family = (fm.app?.package_name ?? fm.app?.artifact_id ?? "imported-report").split(".").slice(-1)[0]!;

  const chainId = `report-${reportId.replace(/[^a-z0-9-]/gi, "")}-${randomUUID().slice(0, 4)}`;
  const seedIoc = extracted.iocs[0] ?? {
    type: "package" as const,
    value: fm.app?.package_name ?? "unknown",
    source: "report-ingester",
  };
  const severityScore = initialVerdict === "malicious" ? 70 : initialVerdict === "benign" ? 20 : 45;
  const severity = severityScore >= 60 ? "high" : severityScore >= 35 ? "medium" : "low";

  // INSERT chain
  db().prepare(
    `INSERT INTO chains
     (id, category, family, source, seed_ioc_type, seed_ioc_value, first_seen,
      severity, severity_score, summary, tags_json,
      status, created_by_kind, created_by_id,
      verdict, verdict_source, verdict_set_at, verdict_set_by_kind, verdict_set_by_id,
      agent_initial_verdict, agent_confidence,
      app_id, source_report_id)
     VALUES (?, ?, ?, 'report', ?, ?, ?,
             ?, ?, ?, ?,
             'proposed', ?, ?,
             ?, 'agent', datetime('now'), ?, ?,
             ?, ?,
             ?, ?)`,
  ).run(
    chainId, category, family, seedIoc.type, seedIoc.value, fm.first_seen ?? new Date().toISOString(),
    severity, severityScore,
    summarizeReport(fm, extracted, initialVerdict),
    JSON.stringify(fm.tags ?? []),
    by.kind, by.id,
    initialVerdict, by.kind, by.id,
    initialVerdict, kbMalicious > 0 ? Math.min(0.9, 0.5 + 0.1 * kbMalicious) : 0.4,
    appId, reportId,
  );

  // Build one node per extracted technique (deduped). If none, create a single
  // "ingested-from-report" placeholder node so the chain isn't empty.
  const techniques = extracted.techniques.length > 0
    ? extracted.techniques
    : [{ id: "T1106", tactic: "Execution" as Tactic }];

  let lastNodeId: string | null = null;
  techniques.forEach((t, idx) => {
    const nodeId = `${chainId}--t${idx}-${t.id.toLowerCase().replace(".", "-")}`;
    const techName = TECH_NAMES[t.id.split(".")[0]!] ?? "Ingested technique";
    db().prepare(
      `INSERT INTO chain_nodes
       (id, chain_id, step, technique_id, technique_name, tactic, title, description,
        static_agent_note, dynamic_agent_note,
        status, created_by_kind, created_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`,
    ).run(
      nodeId, chainId, idx + 1, t.id, techName, t.tactic,
      `${techName} (from report)`,
      `Technique ${t.id} extracted from report ${reportId}. Review for accuracy.`,
      `Report-ingester [rule-based]: matched ${t.id} in report body.`,
      null,
      by.kind, by.id,
    );
    if (lastNodeId) {
      db().prepare("INSERT OR IGNORE INTO chain_edges (chain_id, from_node, to_node) VALUES (?, ?, ?)")
        .run(chainId, lastNodeId, nodeId);
    }
    lastNodeId = nodeId;
  });

  // Attach all IOCs to the first node
  const firstNodeId = `${chainId}--t0-${techniques[0]!.id.toLowerCase().replace(".", "-")}`;
  for (const ioc of extracted.iocs) {
    db().prepare("INSERT INTO iocs (node_id, type, value, source) VALUES (?, ?, ?, ?)")
      .run(firstNodeId, ioc.type, ioc.value, ioc.source ?? "report-ingester");

    // Auto-attach kb_match evidence if the IOC hits the KB
    const hit = kbLookup(ioc.type as IndicatorType, ioc.value);
    if (hit) {
      db().prepare(
        `INSERT INTO evidence
         (id, node_id, category, kind, label, value, meta_json, status, created_by_kind, created_by_id)
         VALUES (?, ?, 'static', 'kb_match', ?, ?, ?, 'accepted', ?, ?)`,
      ).run(
        randomUUID(),
        firstNodeId,
        `KB ${hit.polarity}: ${ioc.type} ${ioc.value}`,
        hit.notesMd ?? `Matched indicator #${hit.indicatorId} (${hit.polarity}, conf ${hit.confidence}).`,
        JSON.stringify({ polarity: hit.polarity, category: hit.category ?? "", confidence: hit.confidence, indicatorId: hit.indicatorId }),
        by.kind, by.id,
      );
    }
  }

  // Insert report row
  db().prepare(
    `INSERT INTO reports
     (id, app_id, source_path, filename, body_blob_sha, content_hash,
      declared_category, declared_label, effective_label, flipped,
      status, ingested_chain_id, frontmatter_json, tags_json, first_seen_iso,
      imported_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?,
             ?, ?, NULL, 0,
             'ingested', ?, ?, ?, ?,
             datetime('now'), datetime('now'))`,
  ).run(
    reportId, appId, args.sourcePath ?? null, args.filename ?? null,
    bodyBlob.sha256, contentHash,
    fm.category ?? null, fm.declared_label ?? null,
    chainId, JSON.stringify(fm), JSON.stringify(fm.tags ?? []),
    fm.first_seen ?? null,
  );

  // Sync FTS
  db().prepare(
    `INSERT INTO chains_fts (id, family, summary, tags, seed_ioc_value) VALUES (?, ?, ?, ?, ?)`,
  ).run(chainId, family, summarizeReport(fm, extracted, initialVerdict),
        JSON.stringify(fm.tags ?? []), seedIoc.value);

  audit("chain", chainId, "ingested_from_report", by, { reportId, techniques: techniques.length, iocs: extracted.iocs.length });
  audit("evidence", reportId, "report_ingested", by, { chainId, contentHash });

  // Reindex new nodes for TF-IDF retrieval
  for (let i = 0; i < techniques.length; i++) {
    const nodeId = `${chainId}--t${i}-${techniques[i]!.id.toLowerCase().replace(".", "-")}`;
    reindexNode(nodeId);
  }

  bumpChainTimestamp(chainId);
  void loadChain; // keep import live for downstream consumers

  return {
    reportId,
    chainId,
    appId,
    nodeCount: techniques.length,
    iocCount: extracted.iocs.length,
    contentHash,
    created: true,
    flippedChain: false,
  };
}

function summarizeReport(fm: Frontmatter, ex: Extracted, verdict: string): string {
  const pkg = fm.app?.package_name ?? "(no package)";
  return `${pkg} — ${fm.category ?? "uncategorized"} — verdict ${verdict} — ${ex.techniques.length} TTPs, ${ex.iocs.length} IOCs`;
}
