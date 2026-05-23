import { z } from "zod";

export const zActorKind = z.enum(["user", "agent"]);
export const zActor = z.object({ kind: zActorKind, id: z.string().min(1).max(64) });

export const zCategory = z.enum(["riskware", "toll_fraud", "phishing"]);
export const zSeverity = z.enum(["low", "medium", "high", "critical"]);
export const zStatus = z.enum(["proposed", "accepted", "refuted", "archived"]);

export const zTactic = z.enum([
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Privilege Escalation",
  "Defense Evasion",
  "Credential Access",
  "Discovery",
  "Collection",
  "Command and Control",
  "Exfiltration",
  "Impact",
]);

export const zIocType = z.enum([
  "url",
  "domain",
  "ip",
  "sha256",
  "md5",
  "email",
  "phone",
  "package",
  "registry",
]);

export const zIoc = z.object({
  type: zIocType,
  value: z.string().min(1).max(2048),
  source: z.string().max(128).optional(),
});

// ---------------------------------------------------------------------------
// Evidence payload schemas (per kind)
// ---------------------------------------------------------------------------

export const zFridaTracePayload = z.object({
  scriptBlobSha256: z.string().length(64).optional(),
  events: z
    .array(
      z.object({
        t: z.number(),
        type: z.string().max(64),
        target: z.string().max(512).optional(),
        args: z.unknown().optional(),
        result: z.unknown().optional(),
      }),
    )
    .max(10_000),
});

export const zHarCapturePayload = z.object({
  entries: z
    .array(
      z.object({
        method: z.string().max(16),
        url: z.string().max(4096),
        host: z.string().max(512),
        status: z.number().int(),
        mime: z.string().max(128).optional(),
        requestBytes: z.number().int().nonnegative(),
        responseBytes: z.number().int().nonnegative(),
        durationMs: z.number().nonnegative(),
        startedAt: z.string(),
      }),
    )
    .max(5_000),
});

export const zPcapCapturePayload = z.object({
  flows: z
    .array(
      z.object({
        src: z.string().max(256),
        dst: z.string().max(256),
        proto: z.string().max(32),
        bytes: z.number().int().nonnegative(),
        packets: z.number().int().nonnegative(),
      }),
    )
    .max(2_000),
  totalPackets: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  capturedAtIso: z.string(),
});

export const zSourceArtifactPayload = z.object({
  language: z.string().max(32),
  highlights: z
    .array(
      z.object({
        line: z.number().int().positive(),
        note: z.string().max(2048),
        severity: z.enum(["info", "warn", "high"]).optional(),
      }),
    )
    .max(500)
    .optional(),
});

// ---------------------------------------------------------------------------
// Evidence discriminated union — kind decides which payload schema applies
// ---------------------------------------------------------------------------

const baseEvidenceInput = {
  label: z.string().min(1).max(256),
  value: z.string().max(64_000).default(""),
  meta: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  timestamp: z.number().optional(),
};

export const zStaticEvidenceInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hash"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("permission"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("manifest_excerpt"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("string_artifact"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("yara_hit"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("dom_snippet"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("cert"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("url_target"), ...baseEvidenceInput }),
  z.object({
    kind: z.literal("source_artifact"),
    ...baseEvidenceInput,
    payload: zSourceArtifactPayload,
  }),
]);

export const zDynamicEvidenceInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("syscall"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("network_request"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("sms_send"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("permission_request"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("ui_capture"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("credential_capture"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("file_write"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("process_spawn"), ...baseEvidenceInput }),
  z.object({ kind: z.literal("click_chain"), ...baseEvidenceInput }),
  z.object({
    kind: z.literal("frida_trace"),
    ...baseEvidenceInput,
    payload: zFridaTracePayload,
  }),
  z.object({
    kind: z.literal("har_capture"),
    ...baseEvidenceInput,
    payload: zHarCapturePayload,
  }),
  z.object({
    kind: z.literal("pcap_capture"),
    ...baseEvidenceInput,
    payload: zPcapCapturePayload,
  }),
]);

// ---------------------------------------------------------------------------
// Inputs for write endpoints
// ---------------------------------------------------------------------------

export const zCreateNodeInput = z.object({
  techniqueId: z.string().min(2).max(32),
  techniqueName: z.string().min(2).max(256),
  tactic: zTactic,
  title: z.string().min(2).max(256),
  description: z.string().max(8192).default(""),
  step: z.number().int().positive().optional(),
  iocs: z.array(zIoc).default([]),
  after: z.string().optional(), // existing node id to connect from
  status: zStatus.default("accepted"),
});

export const zUpdateNodeInput = zCreateNodeInput.partial();

export const zCreateChainInput = z.object({
  category: zCategory,
  family: z.string().min(1).max(128),
  source: z.string().min(1).max(128).default("manual"),
  seedIoc: zIoc,
  firstSeen: z.string().default(() => new Date().toISOString()),
  summary: z.string().max(1024).default(""),
  tags: z.array(z.string().max(64)).default([]),
});

export const zCreateEdgeInput = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().max(64).optional(),
});

export const zCreateCommentInput = z.object({
  bodyMd: z.string().min(1).max(16_384),
});

export const zVerificationInput = z.object({
  status: z.enum(["pending", "confirmed", "refuted", "inconclusive"]),
  method: z.string().max(256).optional(),
});

export const zActorHeader = z.object({
  kind: zActorKind.default("user"),
  id: z.string().min(1).max(64).default("anonymous"),
});

export const zReviewInput = z.object({
  decision: z.enum(["accept", "reject", "edit"]),
  edits: z.record(z.unknown()).optional(),
});
