import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { buildIndex, loadChain } from "../repo.js";

// ---------------------------------------------------------------------------
// STIX 2.1 export — emits a Bundle of {attack-pattern, indicator, identity, relationship}
// objects derived from chain nodes + IOCs.
// ---------------------------------------------------------------------------

function stixId(type: string): string {
  return `${type}--${randomUUID()}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function iocPattern(type: string, value: string): string {
  switch (type) {
    case "sha256": return `[file:hashes.'SHA-256' = '${value}']`;
    case "md5":    return `[file:hashes.MD5 = '${value}']`;
    case "url":    return `[url:value = '${value.replace(/'/g, "\\'")}']`;
    case "domain": return `[domain-name:value = '${value}']`;
    case "ip":     return `[ipv4-addr:value = '${value}']`;
    case "email":  return `[email-addr:value = '${value}']`;
    case "package":return `[software:name = '${value}']`;
    case "phone":  return `[user-account:account_login = '${value}']`;
    default:       return `[x-darkseed:${type} = '${value}']`;
  }
}

function buildStixBundle(chainId: string): unknown {
  const chain = loadChain(chainId);
  if (!chain) return null;
  const objects: unknown[] = [];
  const now = isoNow();
  const identityId = stixId("identity");
  objects.push({
    type: "identity",
    spec_version: "2.1",
    id: identityId,
    created: now,
    modified: now,
    name: "darkseed",
    identity_class: "system",
    description: `darkseed chain ${chain.id} (${chain.family}, ${chain.category})`,
  });

  const nodeIdToStix = new Map<string, string>();
  for (const n of chain.nodes) {
    const id = stixId("attack-pattern");
    nodeIdToStix.set(n.id, id);
    objects.push({
      type: "attack-pattern",
      spec_version: "2.1",
      id,
      created: n.createdAt,
      modified: n.updatedAt,
      created_by_ref: identityId,
      name: n.title,
      description: n.description,
      external_references: [
        { source_name: "mitre-attack", external_id: n.techniqueId },
      ],
      x_darkseed_tactic: n.tactic,
      x_darkseed_status: n.status,
    });

    for (const ioc of n.iocs) {
      const indId = stixId("indicator");
      objects.push({
        type: "indicator",
        spec_version: "2.1",
        id: indId,
        created: n.createdAt,
        modified: n.updatedAt,
        created_by_ref: identityId,
        name: `${ioc.type}: ${ioc.value.slice(0, 64)}`,
        pattern_type: "stix",
        pattern: iocPattern(ioc.type, ioc.value),
        valid_from: chain.firstSeen,
        indicator_types: ["malicious-activity"],
      });
      objects.push({
        type: "relationship",
        spec_version: "2.1",
        id: stixId("relationship"),
        created: now,
        modified: now,
        relationship_type: "indicates",
        source_ref: indId,
        target_ref: id,
      });
    }
  }
  // Edges -> relationships of type "related-to"
  for (const e of chain.edges) {
    const src = nodeIdToStix.get(e.from);
    const dst = nodeIdToStix.get(e.to);
    if (!src || !dst) continue;
    objects.push({
      type: "relationship",
      spec_version: "2.1",
      id: stixId("relationship"),
      created: now,
      modified: now,
      relationship_type: "related-to",
      source_ref: src,
      target_ref: dst,
    });
  }
  return {
    type: "bundle",
    id: `bundle--${randomUUID()}`,
    objects,
  };
}

// ---------------------------------------------------------------------------
// JSONL bulk dump of all chains (one chain per line)
// ---------------------------------------------------------------------------

function buildJsonl(): string {
  const idx = buildIndex();
  const lines: string[] = [];
  for (const s of idx.chains) {
    const c = loadChain(s.id);
    if (c) lines.push(JSON.stringify(c));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------

export function mountExportRoutes(app: Hono): void {
  app.get("/api/export/stix/:chainId", (c) => {
    const bundle = buildStixBundle(c.req.param("chainId"));
    if (!bundle) return c.json({ error: "not found" }, 404);
    c.header("Content-Type", "application/stix+json");
    return c.body(JSON.stringify(bundle, null, 2));
  });

  app.get("/api/export/jsonl", (c) => {
    const body = buildJsonl();
    c.header("Content-Type", "application/x-ndjson");
    c.header("Content-Disposition", `attachment; filename="darkseed-chains.jsonl"`);
    return c.body(body);
  });

  app.get("/api/export/stats", (c) => {
    const d = db();
    const stats = {
      chains: (d.prepare("SELECT COUNT(*) AS n FROM chains").get() as { n: number }).n,
      nodes: (d.prepare("SELECT COUNT(*) AS n FROM chain_nodes").get() as { n: number }).n,
      evidence: (d.prepare("SELECT COUNT(*) AS n FROM evidence").get() as { n: number }).n,
      iocs: (d.prepare("SELECT COUNT(*) AS n FROM iocs").get() as { n: number }).n,
      blobs: (d.prepare("SELECT COUNT(*) AS n FROM blobs").get() as { n: number }).n,
      labels: (d.prepare("SELECT COUNT(*) AS n FROM labels").get() as { n: number }).n,
      proposed: (d.prepare("SELECT COUNT(*) AS n FROM chain_nodes WHERE status='proposed'").get() as { n: number }).n,
    };
    return c.json(stats);
  });
}
