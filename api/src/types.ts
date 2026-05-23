// Shared API types — re-exported by both server and dashboard.

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

export type Status = "proposed" | "accepted" | "refuted" | "archived";
export type ActorKind = "user" | "agent";
export type Verdict = "pending" | "malicious" | "benign" | "inconclusive";
export type VerdictSource = "agent" | "reviewer" | "flipped";
export type FeedbackDecision = "agree" | "disagree" | "edit" | "note_only";

export interface Actor {
  kind: ActorKind;
  id: string;
}

export interface IOC {
  type: "url" | "domain" | "ip" | "sha256" | "md5" | "email" | "phone" | "package" | "registry";
  value: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// Discriminated-union evidence kinds. Each kind has its own payload schema
// and its own React viewer component on the dashboard.
// ---------------------------------------------------------------------------

export type StaticEvidenceKind =
  | "hash"
  | "permission"
  | "manifest_excerpt"
  | "string_artifact"
  | "yara_hit"
  | "dom_snippet"
  | "cert"
  | "url_target"
  | "source_artifact"; // multi-KB decompiled blob, references blob_sha256

export type DynamicEvidenceKind =
  | "syscall"
  | "network_request"
  | "sms_send"
  | "permission_request"
  | "ui_capture"
  | "credential_capture"
  | "file_write"
  | "process_spawn"
  | "click_chain"
  | "frida_trace" // .js hook + ndjson events
  | "har_capture" // HAR JSON blob
  | "pcap_capture"; // PCAP blob (parsed summary stored inline)

export interface EvidenceBase {
  id: string;
  nodeId: string;
  category: "static" | "dynamic";
  label: string;
  value: string; // inline display text (truncated)
  meta: Record<string, string | number | boolean>;
  payload?: unknown; // per-kind structured payload (see schemas)
  blob?: {
    sha256: string;
    size: number;
    mime?: string;
    filename?: string;
  } | null;
  timestamp?: number; // ms offset from chain start, dynamic only
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

export interface StaticEvidence extends EvidenceBase {
  category: "static";
  kind: StaticEvidenceKind;
}
export interface DynamicEvidence extends EvidenceBase {
  category: "dynamic";
  kind: DynamicEvidenceKind;
}
export type Evidence = StaticEvidence | DynamicEvidence;

// Per-kind structured payloads (the `payload` field above)

export interface FridaTracePayload {
  scriptBlobSha256?: string; // .js hook source
  events: Array<{
    t: number; // ms offset
    type: string; // e.g. "java_call", "send", "exception"
    target?: string; // e.g. "android.app.Activity.startActivity"
    args?: unknown;
    result?: unknown;
  }>;
}

export interface HarCapturePayload {
  // Parsed summary; full HAR lives in blob
  entries: Array<{
    method: string;
    url: string;
    host: string;
    status: number;
    mime?: string;
    requestBytes: number;
    responseBytes: number;
    durationMs: number;
    startedAt: string;
  }>;
}

export interface PcapCapturePayload {
  flows: Array<{
    src: string;
    dst: string;
    proto: string;
    bytes: number;
    packets: number;
  }>;
  totalPackets: number;
  totalBytes: number;
  capturedAtIso: string;
}

export interface SourceArtifactPayload {
  language: string; // smali, java, javascript, swift, ...
  // Source lives in blob (could be large)
  highlights?: Array<{ line: number; note: string; severity?: "info" | "warn" | "high" }>;
}

// ---------------------------------------------------------------------------
// Chain / node / edge
// ---------------------------------------------------------------------------

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

export interface IndexResponse {
  generatedAt: string;
  total: number;
  byCategory: Record<Category, number>;
  bySeverity: Record<Severity, number>;
  families: string[];
  sources: string[];
  chains: ChainSummary[];
}

export interface Comment {
  id: number;
  nodeId: string;
  bodyMd: string;
  createdAt: string;
  createdBy: Actor;
}

export interface AuditEntry {
  id: number;
  entityType: "chain" | "node" | "evidence" | "edge" | "comment";
  entityId: string;
  action: string;
  actor: Actor;
  diff?: unknown;
  createdAt: string;
}

export interface QueueItem {
  id: string;
  entityType: "node" | "evidence";
  chainId: string;
  nodeId: string;
  summary: string;
  proposedBy: Actor;
  proposedAt: string;
  payload: ChainNode | Evidence;
}

export interface SimilarItem {
  nodeId: string;
  chainId: string;
  score: number;
  title: string;
  techniqueId: string;
  category: Category;
  severity: Severity;
}

// ---------------------------------------------------------------------------
// Phase 7 — indicator KB
// ---------------------------------------------------------------------------

export type IndicatorType =
  | "package" | "domain" | "ip" | "sha256" | "md5" | "cert" | "ja3"
  | "elf" | "url" | "phone" | "email";
export type IndicatorPolarity = "benign" | "malicious";

export interface Indicator {
  id: number;
  type: IndicatorType;
  value: string;
  polarity: IndicatorPolarity;
  category: Category | "infra" | "sdk" | null;
  confidence: number;
  source: string | null;
  notesMd: string | null;
  createdAt: string;
  createdBy: Actor;
}

// ---------------------------------------------------------------------------
// Phase 8 — apps + reports
// ---------------------------------------------------------------------------

export interface App {
  id: string;            // = apk_sha256
  artifactId: string | null;
  packageName: string | null;
  versionName: string | null;
  versionCode: number | null;
  apkSha256: string | null;
  apkBlobSha: string | null;
  firstSeenAt: string;
  source: string | null;
}

export type ReportStatus = "pending" | "processing" | "ingested" | "rejected";

export interface Report {
  id: string;
  appId: string | null;
  sourcePath: string | null;
  filename: string | null;
  bodyBlobSha: string;
  contentHash: string;
  declaredCategory: Category | null;
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
