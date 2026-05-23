import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllSeeds, type FeedSeed } from "./feeds.js";
import { templatesForCategory, type Template, type TemplateNode } from "./templates.js";
import { buildChainNodeEvidence } from "./evidence.js";
import { scoreChain, summarize } from "./severity.js";
import { mulberry32, pick, type Rng } from "./random.js";
import type {
  Category,
  Chain,
  ChainEdge,
  ChainNode,
  ChainSummary,
  Index,
} from "./types.js";

const TARGET_TOTAL = Number(process.env.DARKSEED_TOTAL ?? 1000);
const SEED = Number(process.env.DARKSEED_SEED ?? 1337);

// Desired mix across categories
const MIX: Record<Category, number> = {
  riskware: 0.4,
  toll_fraud: 0.25,
  phishing: 0.35,
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const DATA_DIR = resolve(REPO_ROOT, "data");
const CHAINS_DIR = resolve(DATA_DIR, "chains");

async function main() {
  console.log(`[generate] target=${TARGET_TOTAL} seed=${SEED}`);
  const allSeeds = await fetchAllSeeds();
  const seedsByCat = groupBy(allSeeds, (s) => s.category);
  for (const cat of Object.keys(MIX) as Category[]) {
    console.log(`[generate] seeds for ${cat}: ${seedsByCat[cat]?.length ?? 0}`);
  }

  // Wipe + recreate data dir
  await rm(DATA_DIR, { recursive: true, force: true });
  await mkdir(CHAINS_DIR, { recursive: true });

  const summaries: ChainSummary[] = [];
  const counts: Record<Category, number> = { riskware: 0, toll_fraud: 0, phishing: 0 };

  const targets: Record<Category, number> = {
    riskware: Math.round(TARGET_TOTAL * MIX.riskware),
    toll_fraud: Math.round(TARGET_TOTAL * MIX.toll_fraud),
    phishing: Math.round(TARGET_TOTAL * MIX.phishing),
  };
  // Adjust for rounding
  const diff = TARGET_TOTAL - (targets.riskware + targets.toll_fraud + targets.phishing);
  targets.phishing += diff;

  let chainSeq = 0;
  const rng = mulberry32(SEED);

  for (const cat of Object.keys(targets) as Category[]) {
    const seeds = seedsByCat[cat] ?? [];
    const templates = templatesForCategory(cat);
    if (seeds.length === 0 || templates.length === 0) {
      console.warn(`[generate] skipping ${cat}: seeds=${seeds.length} templates=${templates.length}`);
      continue;
    }
    for (let n = 0; n < targets[cat]; n++) {
      chainSeq++;
      const seed = seeds[Math.floor(rng() * seeds.length)]!;
      const template = pickWeighted(rng, templates);
      const chain = buildChain(rng, chainSeq, cat, seed, template);
      summaries.push(toSummary(chain));
      counts[cat]++;
      const file = resolve(CHAINS_DIR, `${chain.id}.json`);
      await writeFile(file, JSON.stringify(chain));
      if (chainSeq % 100 === 0) console.log(`[generate] wrote ${chainSeq}/${TARGET_TOTAL}`);
    }
  }

  const families = Array.from(new Set(summaries.map((s) => s.family))).sort();
  const sources = Array.from(new Set(summaries.map((s) => s.source))).sort();
  const bySeverity = summaries.reduce(
    (acc, s) => ((acc[s.severity] = (acc[s.severity] ?? 0) + 1), acc),
    { low: 0, medium: 0, high: 0, critical: 0 } as Index["bySeverity"],
  );

  const index: Index = {
    generatedAt: new Date().toISOString(),
    total: summaries.length,
    byCategory: counts,
    bySeverity,
    families,
    sources,
    chains: summaries.sort((a, b) => b.severityScore - a.severityScore),
  };
  await writeFile(resolve(DATA_DIR, "index.json"), JSON.stringify(index, null, 2));
  console.log(`[generate] DONE — ${summaries.length} chains written to ${DATA_DIR}`);
  console.log(`[generate] mix:`, counts);
  console.log(`[generate] severity:`, bySeverity);
}

function pickWeighted(rng: Rng, templates: Template[]): Template {
  const weights = templates.map((t) => t.weight ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < templates.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return templates[i]!;
  }
  return templates[templates.length - 1]!;
}

function buildChain(
  rng: Rng,
  seq: number,
  category: Category,
  seed: FeedSeed,
  template: Template,
): Chain {
  const id = `${category}-${String(seq).padStart(4, "0")}`;
  const nodes: ChainNode[] = [];
  const edges: ChainEdge[] = [];
  const aggregateIocs: Map<string, { type: string; value: string; source?: string }> = new Map();

  // Compute topological order (templates are DAGs; we authored them in order, so insertion order works).
  template.nodes.forEach((tNode, idx) => {
    const nodeId = `${id}--${tNode.key}`;
    const ev = buildChainNodeEvidence(rng, category, seed.family, tNode, seed.ioc, idx);
    const node: ChainNode = {
      id: nodeId,
      step: idx + 1,
      techniqueId: tNode.techniqueId,
      techniqueName: tNode.techniqueName,
      tactic: tNode.tactic,
      title: tNode.title,
      description: tNode.description,
      iocs: ev.iocs,
      evidence: ev.evidence,
      agentNotes: ev.agentNotes,
    };
    nodes.push(node);
    for (const ioc of ev.iocs) aggregateIocs.set(`${ioc.type}|${ioc.value}`, ioc);

    for (const target of tNode.next ?? []) {
      edges.push({ from: nodeId, to: `${id}--${target}`, label: undefined });
    }
  });

  // Seed IOC is always present at chain level
  aggregateIocs.set(`${seed.ioc.type}|${seed.ioc.value}`, seed.ioc);

  const skeleton: Omit<Chain, "summary" | "severity" | "severityScore"> = {
    id,
    category,
    family: seed.family,
    source: seed.source,
    seedIoc: seed.ioc,
    firstSeen: seed.firstSeen,
    tags: seed.tags,
    nodes,
    edges,
  };
  const { score, severity } = scoreChain(nodes);
  const summary = summarize(skeleton);

  return { ...skeleton, severity, severityScore: score, summary };
}

function toSummary(c: Chain): ChainSummary {
  return {
    id: c.id,
    category: c.category,
    family: c.family,
    source: c.source,
    firstSeen: c.firstSeen,
    severity: c.severity,
    severityScore: c.severityScore,
    summary: c.summary,
    tags: c.tags,
    nodeCount: c.nodes.length,
    seedIocValue: c.seedIoc.value,
    seedIocType: c.seedIoc.type,
  };
}

function groupBy<T, K extends string>(arr: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of arr) {
    const k = key(x);
    (out[k] ??= []).push(x);
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
