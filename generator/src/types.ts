export type Category = "riskware" | "toll_fraud" | "phishing";

export type Severity = "low" | "medium" | "high" | "critical";

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

export interface IOC {
  type: "url" | "domain" | "ip" | "sha256" | "md5" | "email" | "phone" | "package" | "registry";
  value: string;
  source?: string;
}

export interface StaticEvidenceItem {
  kind:
    | "hash"
    | "permission"
    | "manifest_excerpt"
    | "string_artifact"
    | "yara_hit"
    | "dom_snippet"
    | "cert"
    | "url_target";
  label: string;
  value: string;
  meta?: Record<string, string | number | boolean>;
}

export interface DynamicEvidenceItem {
  kind:
    | "syscall"
    | "network_request"
    | "sms_send"
    | "permission_request"
    | "ui_capture"
    | "credential_capture"
    | "file_write"
    | "process_spawn"
    | "click_chain";
  label: string;
  value: string;
  timestamp: number; // ms offset from chain start
  meta?: Record<string, string | number | boolean>;
}

export interface ChainNode {
  id: string;
  step: number;
  techniqueId: string; // e.g. T1566.002
  techniqueName: string;
  tactic: Tactic;
  title: string;
  description: string;
  iocs: IOC[];
  evidence: {
    static: StaticEvidenceItem[];
    dynamic: DynamicEvidenceItem[];
  };
  agentNotes: {
    staticAgent: string;
    dynamicAgent: string;
  };
}

export interface ChainEdge {
  from: string;
  to: string;
  label?: string;
}

export interface Chain {
  id: string;
  category: Category;
  family: string;
  source: string; // feed source name
  seedIoc: IOC;
  firstSeen: string; // ISO date
  severity: Severity;
  severityScore: number; // 0-100
  summary: string;
  tags: string[];
  nodes: ChainNode[];
  edges: ChainEdge[];
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
