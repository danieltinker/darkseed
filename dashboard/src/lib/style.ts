import type { Category, Severity, Tactic } from "./types";

export const CATEGORY_COLOR: Record<Category, string> = {
  riskware: "#f59e0b",
  toll_fraud: "#a855f7",
  phishing: "#ef4444",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  riskware: "Riskware",
  toll_fraud: "Toll Fraud",
  phishing: "Phishing",
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  low: "#65a30d",
  medium: "#ca8a04",
  high: "#ea580c",
  critical: "#dc2626",
};

export const TACTIC_COLOR: Record<Tactic, string> = {
  Reconnaissance: "#94a3b8",
  "Resource Development": "#94a3b8",
  "Initial Access": "#22d3ee",
  Execution: "#60a5fa",
  Persistence: "#a78bfa",
  "Privilege Escalation": "#fb923c",
  "Defense Evasion": "#fbbf24",
  "Credential Access": "#f472b6",
  Discovery: "#a3a3a3",
  Collection: "#34d399",
  "Command and Control": "#818cf8",
  Exfiltration: "#fb7185",
  Impact: "#ef4444",
};

export function shortTactic(t: Tactic): string {
  return t
    .split(" ")
    .map((w) => w[0])
    .join("");
}
