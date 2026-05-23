import type { Chain, ChainNode, Severity } from "./types.js";

// Tactic weights — Impact and Credential Access raise severity the most.
const TACTIC_WEIGHT: Record<string, number> = {
  Impact: 18,
  "Credential Access": 14,
  Exfiltration: 12,
  "Privilege Escalation": 10,
  "Defense Evasion": 7,
  Persistence: 6,
  "Command and Control": 6,
  Collection: 5,
  Execution: 4,
  "Initial Access": 4,
  Discovery: 2,
  "Resource Development": 1,
  Reconnaissance: 1,
};

export function scoreChain(nodes: ChainNode[]): { score: number; severity: Severity } {
  // Sum of tactic weights + small bonus for chain length, capped 0..100
  let raw = 0;
  for (const n of nodes) raw += TACTIC_WEIGHT[n.tactic] ?? 3;
  raw += Math.min(20, nodes.length); // length bonus, capped

  const score = Math.min(100, Math.round(raw));
  const severity: Severity =
    score >= 80 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";
  return { score, severity };
}

export function summarize(chain: Omit<Chain, "summary" | "severity" | "severityScore">): string {
  const initial = chain.nodes.find((n) => n.tactic === "Initial Access")?.title;
  const impact = [...chain.nodes].reverse().find((n) => n.tactic === "Impact")?.title;
  const exfil = chain.nodes.find((n) => n.tactic === "Exfiltration")?.title;
  const tail = impact ?? exfil ?? chain.nodes.at(-1)?.title ?? "";
  return [
    `${chain.family} (${chain.category.replace("_", " ")}, seed via ${chain.source})`,
    initial ? `entry: ${initial.toLowerCase()}` : null,
    tail ? `terminal: ${tail.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
}
