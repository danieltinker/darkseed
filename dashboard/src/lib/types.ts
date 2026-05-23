// Dashboard mirror of api/src/types.ts — kept in sync manually.

export type Category = "riskware" | "toll_fraud" | "phishing";
export type Severity = "low" | "medium" | "high" | "critical";
export type Status = "proposed" | "accepted" | "refuted" | "archived";
export type ActorKind = "user" | "agent";
export type Verdict = "pending" | "malicious" | "benign" | "inconclusive";
export type VerdictSource = "agent" | "reviewer" | "flipped";
export type FeedbackDecision = "agree" | "disagree" | "edit" | "note_only";

export type Tactic =
  | "Reconnaissance"
  | "Resource Development"
  | "Initial Access"
  | "Execution"
  | "Persistence"
  | "Privilege Escalation"
  | "Defense Evasion"
  | "Credential Access"
  | "Discovery"
  | "Collection"
  | "Command and Control"
  | "Exfiltration"
  | "Impact";

export interface Actor {
  kind: ActorKind;
  id: string;
}

export interface IOC {
  type: "url" | "domain" | "ip" | "sha256" | "md5" | "email" | "phone" | "package" | "registry";
  value: string;
  source?: string;
}

export interface EvidenceBase {
  id: string;
  nodeId: string;
  category: "static" | "dynamic";
  kind: string;
  label: string;
  value: string;
  meta: Record<string, string | number | boolean>;
  payload?: unknown;
  blob?: {
    sha256: string;
    size: number;
    mime?: string;
    filename?: string;
  } | null;
  timestamp?: number;
  verification?: {
    status: "pending" | "confirmed" | "refuted" | "inconclusive";
    method?: string;
    by?: string;
    at?: string;
  } | null;
  status: Status;
  createdAt: string;
  createdBy: Actor;
}

export type Evidence = EvidenceBase;

export interface ChainNode {
  id: string;
  chainId: string;
  step: number;
  techniqueId: string;
  techniqueName: string;
  tactic: Tactic;
  title: string;
  description: string;
  iocs: IOC[];
  evidence: Evidence[];
  agentNotes: {
    staticAgent?: string;
    dynamicAgent?: string;
  };
  status: Status;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
}

export interface ChainEdge {
  from: string;
  to: string;
  label?: string | null;
}

export interface ChainVerdict {
  verdict: Verdict;
  source: VerdictSource | null;
  setAt: string | null;
  setBy: Actor | null;
  notesMd: string | null;
  agentInitial: Verdict | null;
  agentConfidence: number | null;
}

export interface Chain {
  id: string;
  category: Category;
  family: string;
  source: string;
  seedIoc: IOC;
  firstSeen: string;
  severity: Severity;
  severityScore: number;
  summary: string;
  tags: string[];
  nodes: ChainNode[];
  edges: ChainEdge[];
  status: Status;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  verdict: ChainVerdict;
  appId?: string | null;
  sourceReportId?: string | null;
}

export interface FeedbackItem {
  id: number;
  decision: FeedbackDecision;
  notesMd: string | null;
  createdAt: string;
  createdBy: Actor;
}

// Indicator KB
export type IndicatorType =
  | "package" | "domain" | "ip" | "sha256" | "md5" | "cert" | "ja3"
  | "elf" | "url" | "phone" | "email";
export type IndicatorPolarity = "benign" | "malicious";

export interface Indicator {
  id: number;
  type: IndicatorType;
  value: string;
  polarity: IndicatorPolarity;
  category: string | null;
  confidence: number;
  source: string | null;
  notesMd: string | null;
  createdAt: string;
  createdBy: Actor;
}

// Reports
export type ReportStatus = "pending" | "processing" | "ingested" | "rejected";

export interface Report {
  id: string;
  appId: string | null;
  sourcePath: string | null;
  filename: string | null;
  bodyBlobSha: string;
  contentHash: string;
  declaredCategory: string | null;
  declaredLabel: "tp" | "fp" | null;
  effectiveLabel: "tp" | "fp" | null;
  flipped: boolean;
  status: ReportStatus;
  ingestedChainId: string | null;
  frontmatter: Record<string, unknown>;
  tags: string[];
  firstSeenIso: string | null;
  importedAt: string;
  processedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: Actor | null;
}

export interface ChainSummary {
  id: string;
  category: Category;
  family: string;
  source: string;
  firstSeen: string;
  severity: Severity;
  severityScore: number;
  summary: string;
  tags: string[];
  nodeCount: number;
  seedIocValue: string;
  seedIocType: IOC["type"];
  status: Status;
}

export interface Index {
  generatedAt: string;
  total: number;
  byCategory: Record<Category, number>;
  bySeverity: Record<Severity, number>;
  families: string[];
  sources: string[];
  chains: ChainSummary[];
}
