import { useState } from "react";
import clsx from "clsx";
import type { Evidence } from "../lib/types";
import { blobUrl, deleteEvidence, reviewEvidence, verifyEvidence } from "../lib/data";
import { CopyButton } from "./EvidencePanel";
import { FeedbackRow } from "./FeedbackRow";

// Generic envelope; per-kind viewer rendered inside.
export function EvidenceCardFull({
  evidence,
  tone,
  onChanged,
}: {
  evidence: Evidence;
  tone: "emerald" | "sky";
  onChanged?: () => void;
}) {
  const toneBorder = tone === "emerald" ? "border-emerald-900/40 bg-emerald-950/15" : "border-sky-900/40 bg-sky-950/15";
  const toneKind = tone === "emerald" ? "text-emerald-300" : "text-sky-300";

  return (
    <div className={clsx("rounded border p-2 text-[11px]", toneBorder)}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={clsx("font-mono uppercase tracking-wider text-[9px]", toneKind)}>{evidence.kind}</span>
        <span className="text-zinc-200 text-[12px] truncate flex-1 min-w-0">{evidence.label}</span>
        {evidence.timestamp !== undefined && (
          <span className="text-[10px] font-mono text-zinc-500">+{evidence.timestamp}ms</span>
        )}
        {evidence.status === "proposed" && (
          <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-amber-900/40 text-amber-300">proposed</span>
        )}
        <CopyButton text={evidence.value || evidence.label} />
      </div>

      {/* Per-kind body */}
      <div className="mt-1.5">
        <KindBody evidence={evidence} />
      </div>

      {/* Meta tags */}
      {evidence.meta && Object.keys(evidence.meta).length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-mono text-zinc-500">
          {Object.entries(evidence.meta).map(([k, v]) => (
            <span key={k} className="rounded bg-zinc-900/80 border border-zinc-800 px-1 py-0.5">
              {k}=<span className="text-zinc-300">{String(v)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Provenance + verification + actions */}
      <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono text-zinc-500">
        <span className={clsx(evidence.createdBy.kind === "agent" ? "text-amber-400" : "text-emerald-400")}>
          {evidence.createdBy.kind}:{evidence.createdBy.id}
        </span>
        <VerificationBadge evidence={evidence} onChanged={onChanged} />
        {evidence.status === "proposed" && (
          <ReviewButtons evidence={evidence} onChanged={onChanged} />
        )}
        <button
          type="button"
          onClick={async () => {
            if (!confirm("Delete this evidence item?")) return;
            await deleteEvidence(evidence.id);
            onChanged?.();
          }}
          className="ml-auto text-zinc-600 hover:text-red-400 text-[10px]"
          title="delete"
        >
          ✕
        </button>
      </div>
      <div className="mt-1.5">
        <FeedbackRow kind="evidence" entityId={evidence.id} compact />
      </div>
    </div>
  );
}

function KindBody({ evidence }: { evidence: Evidence }) {
  switch (evidence.kind) {
    case "frida_trace":
      return <FridaTraceBody evidence={evidence} />;
    case "har_capture":
      return <HarBody evidence={evidence} />;
    case "pcap_capture":
      return <PcapBody evidence={evidence} />;
    case "source_artifact":
      return <SourceBody evidence={evidence} />;
    case "ui_capture":
      return <UiCaptureBody evidence={evidence} />;
    case "network_request":
      return <NetworkRequestBody evidence={evidence} />;
    case "yara_hit":
      return <YaraBody evidence={evidence} />;
    case "manifest_excerpt":
      return <CodeBody evidence={evidence} language="xml" />;
    case "dom_snippet":
      return <CodeBody evidence={evidence} language="html" />;
    case "hash":
      return <HashBody evidence={evidence} />;
    default:
      return (
        <pre className="whitespace-pre-wrap break-all text-[11px] font-mono text-zinc-300">
          {evidence.value}
        </pre>
      );
  }
}

// ---------------------------------------------------------------------------
// Per-kind viewers
// ---------------------------------------------------------------------------

interface FridaPayload {
  scriptBlobSha256?: string;
  events: Array<{ t: number; type: string; target?: string; args?: unknown; result?: unknown }>;
}
function FridaTraceBody({ evidence }: { evidence: Evidence }) {
  const payload = evidence.payload as FridaPayload | undefined;
  const events = payload?.events ?? [];
  const types = Array.from(new Set(events.map((e) => e.type)));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
        <span>{events.length} events</span>
        {types.length > 0 && <span>· kinds: {types.slice(0, 4).join(", ")}{types.length > 4 ? "…" : ""}</span>}
        {payload?.scriptBlobSha256 && (
          <a
            href={blobUrl(payload.scriptBlobSha256, { download: true })}
            className="ml-auto rounded border border-zinc-800 px-1.5 py-0.5 text-zinc-300 hover:border-amber-600"
            target="_blank"
            rel="noreferrer"
          >
            ⤓ hook.js
          </a>
        )}
        {evidence.blob && (
          <a
            href={blobUrl(evidence.blob.sha256, { download: true })}
            className="rounded border border-zinc-800 px-1.5 py-0.5 text-zinc-300 hover:border-amber-600"
            target="_blank"
            rel="noreferrer"
          >
            ⤓ trace
          </a>
        )}
      </div>
      {events.length > 0 && (
        <div className="max-h-48 overflow-y-auto scroll-thin rounded border border-zinc-800 bg-zinc-950">
          <table className="w-full text-[10px] font-mono">
            <thead className="text-zinc-500 sticky top-0 bg-zinc-950">
              <tr><th className="text-left px-2 py-1">t</th><th className="text-left px-2 py-1">type</th><th className="text-left px-2 py-1">target</th></tr>
            </thead>
            <tbody>
              {events.slice(0, 50).map((e, i) => (
                <tr key={i} className="border-t border-zinc-900">
                  <td className="px-2 py-0.5 text-zinc-500">{e.t}</td>
                  <td className="px-2 py-0.5 text-sky-300">{e.type}</td>
                  <td className="px-2 py-0.5 text-zinc-200 truncate max-w-[280px]">{e.target ?? ""}</td>
                </tr>
              ))}
              {events.length > 50 && (
                <tr><td colSpan={3} className="px-2 py-1 text-center text-zinc-600">+{events.length - 50} more…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface HarPayload {
  entries: Array<{ method: string; url: string; host: string; status: number; mime?: string; requestBytes: number; responseBytes: number; durationMs: number; startedAt: string }>;
}
function HarBody({ evidence }: { evidence: Evidence }) {
  const payload = evidence.payload as HarPayload | undefined;
  const entries = payload?.entries ?? [];
  const totalBytes = entries.reduce((s, e) => s + e.requestBytes + e.responseBytes, 0);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
        <span>{entries.length} requests · {formatBytes(totalBytes)} total</span>
        {evidence.blob && (
          <a href={blobUrl(evidence.blob.sha256, { download: true })} className="ml-auto rounded border border-zinc-800 px-1.5 py-0.5 text-zinc-300 hover:border-amber-600" target="_blank" rel="noreferrer">⤓ {evidence.blob.filename ?? "har"}</a>
        )}
      </div>
      {entries.length > 0 && (
        <div className="max-h-56 overflow-y-auto scroll-thin rounded border border-zinc-800 bg-zinc-950">
          <table className="w-full text-[10px] font-mono">
            <thead className="text-zinc-500 sticky top-0 bg-zinc-950">
              <tr><th className="text-left px-2 py-1">m</th><th className="text-left px-2 py-1">host</th><th className="text-left px-2 py-1">path</th><th className="text-right px-2 py-1">status</th><th className="text-right px-2 py-1">ms</th></tr>
            </thead>
            <tbody>
              {entries.slice(0, 80).map((e, i) => {
                let path = e.url;
                try { path = new URL(e.url).pathname + new URL(e.url).search; } catch { /* ignore */ }
                const stColor = e.status >= 500 ? "text-red-400" : e.status >= 400 ? "text-amber-300" : e.status >= 300 ? "text-sky-300" : "text-emerald-300";
                return (
                  <tr key={i} className="border-t border-zinc-900">
                    <td className="px-2 py-0.5 text-zinc-200">{e.method}</td>
                    <td className="px-2 py-0.5 text-zinc-200 truncate max-w-[140px]">{e.host}</td>
                    <td className="px-2 py-0.5 text-zinc-400 truncate max-w-[260px]">{path}</td>
                    <td className={clsx("px-2 py-0.5 text-right", stColor)}>{e.status}</td>
                    <td className="px-2 py-0.5 text-right text-zinc-500">{Math.round(e.durationMs)}</td>
                  </tr>
                );
              })}
              {entries.length > 80 && (
                <tr><td colSpan={5} className="px-2 py-1 text-center text-zinc-600">+{entries.length - 80} more…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface PcapPayload {
  flows: Array<{ src: string; dst: string; proto: string; bytes: number; packets: number }>;
  totalPackets: number;
  totalBytes: number;
  capturedAtIso: string;
}
function PcapBody({ evidence }: { evidence: Evidence }) {
  const payload = evidence.payload as PcapPayload | undefined;
  const flows = payload?.flows ?? [];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
        <span>{flows.length} flows · {formatBytes(payload?.totalBytes ?? evidence.blob?.size ?? 0)}</span>
        {evidence.blob && (
          <a href={blobUrl(evidence.blob.sha256, { download: true })} className="ml-auto rounded border border-zinc-800 px-1.5 py-0.5 text-zinc-300 hover:border-amber-600" target="_blank" rel="noreferrer">⤓ {evidence.blob.filename ?? "pcap"}</a>
        )}
      </div>
      {flows.length > 0 ? (
        <div className="max-h-48 overflow-y-auto scroll-thin rounded border border-zinc-800 bg-zinc-950">
          <table className="w-full text-[10px] font-mono">
            <thead className="text-zinc-500 sticky top-0 bg-zinc-950">
              <tr><th className="text-left px-2 py-1">src</th><th className="text-left px-2 py-1">dst</th><th className="text-left px-2 py-1">proto</th><th className="text-right px-2 py-1">pkts</th><th className="text-right px-2 py-1">bytes</th></tr>
            </thead>
            <tbody>
              {flows.slice(0, 60).map((f, i) => (
                <tr key={i} className="border-t border-zinc-900">
                  <td className="px-2 py-0.5 text-zinc-200 truncate max-w-[160px]">{f.src}</td>
                  <td className="px-2 py-0.5 text-zinc-200 truncate max-w-[160px]">{f.dst}</td>
                  <td className="px-2 py-0.5 text-amber-300">{f.proto}</td>
                  <td className="px-2 py-0.5 text-right text-zinc-500">{f.packets}</td>
                  <td className="px-2 py-0.5 text-right text-zinc-500">{formatBytes(f.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-[10px] text-zinc-600 italic">PCAP attached as blob — server-side parsing not configured (install tshark to enable).</div>
      )}
    </div>
  );
}

interface SourcePayload {
  language?: string;
  highlights?: Array<{ line: number; note: string; severity?: "info" | "warn" | "high" }>;
}
function SourceBody({ evidence }: { evidence: Evidence }) {
  const payload = evidence.payload as SourcePayload | undefined;
  const lang = payload?.language ?? "text";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
        <span>language: <span className="text-amber-300">{lang}</span></span>
        {evidence.blob && (
          <span>· {formatBytes(evidence.blob.size)}</span>
        )}
        {evidence.blob && (
          <a href={blobUrl(evidence.blob.sha256)} className="ml-auto rounded border border-zinc-800 px-1.5 py-0.5 text-zinc-300 hover:border-amber-600" target="_blank" rel="noreferrer">view ↗</a>
        )}
      </div>
      {payload?.highlights && payload.highlights.length > 0 && (
        <div className="rounded border border-zinc-800 bg-zinc-950 p-1.5 space-y-1">
          {payload.highlights.slice(0, 10).map((h, i) => (
            <div key={i} className="text-[10px] font-mono">
              <span className="text-zinc-500">L{h.line}</span>
              <span className={clsx(
                "ml-2",
                h.severity === "high" ? "text-red-300" : h.severity === "warn" ? "text-amber-300" : "text-zinc-300",
              )}>{h.note}</span>
            </div>
          ))}
        </div>
      )}
      {evidence.value && (
        <pre className="rounded border border-zinc-800 bg-zinc-950 p-2 text-[10px] text-zinc-300 max-h-48 overflow-y-auto scroll-thin whitespace-pre">{evidence.value}</pre>
      )}
    </div>
  );
}

function UiCaptureBody({ evidence }: { evidence: Evidence }) {
  if (evidence.blob && evidence.blob.mime?.startsWith("image/")) {
    return (
      <div className="space-y-1.5">
        <img
          src={blobUrl(evidence.blob.sha256)}
          alt={evidence.label}
          className="max-h-64 rounded border border-zinc-800"
        />
        <div className="text-[10px] font-mono text-zinc-500">{formatBytes(evidence.blob.size)} · {evidence.blob.filename}</div>
      </div>
    );
  }
  return (
    <div className="text-[10px] text-zinc-500 font-mono italic">{evidence.value}</div>
  );
}

function NetworkRequestBody({ evidence }: { evidence: Evidence }) {
  const m = evidence.meta as Record<string, string | number | boolean>;
  const method = m.method ?? "?";
  const host = m.host ?? "";
  const path = m.path ?? "";
  const status = m.status ?? "?";
  return (
    <div className="text-[11px] font-mono text-zinc-300">
      <span className="text-emerald-400">{String(method)}</span>{" "}
      <span className="text-zinc-200">{String(host)}{String(path)}</span>{" "}
      <span className="text-zinc-500">→ {String(status)}</span>
      <div className="text-[10px] text-zinc-500 mt-0.5">{evidence.value}</div>
    </div>
  );
}

function YaraBody({ evidence }: { evidence: Evidence }) {
  const rule = (evidence.meta?.rule as string) ?? evidence.label;
  return (
    <div className="text-[11px] font-mono">
      <span className="text-emerald-400">rule</span> <span className="text-zinc-100">{String(rule)}</span>
      <div className="mt-0.5 text-[10px] text-zinc-400">{evidence.value}</div>
    </div>
  );
}

function CodeBody({ evidence, language }: { evidence: Evidence; language: string }) {
  return (
    <pre className="rounded border border-zinc-800 bg-zinc-950 p-2 text-[10px] font-mono text-zinc-300 whitespace-pre-wrap break-all">
      <span className="text-zinc-600 text-[9px] mr-2 select-none">{language}</span>
      {evidence.value}
    </pre>
  );
}

function HashBody({ evidence }: { evidence: Evidence }) {
  return (
    <div className="text-[11px] font-mono text-zinc-100 flex items-center gap-2">
      <span className="text-zinc-500 text-[9px] uppercase">{(evidence.meta?.algo as string) ?? "hash"}</span>
      <span className="break-all">{evidence.value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification + review
// ---------------------------------------------------------------------------

function VerificationBadge({ evidence, onChanged }: { evidence: Evidence; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const v = evidence.verification;
  const cycle = async () => {
    const next: "pending" | "confirmed" | "refuted" | "inconclusive" =
      !v || v.status === "pending"
        ? "confirmed"
        : v.status === "confirmed"
          ? "refuted"
          : v.status === "refuted"
            ? "inconclusive"
            : "pending";
    setBusy(true);
    try {
      await verifyEvidence(evidence.id, next, "manual");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };
  const label = v?.status ?? "unverified";
  const color =
    v?.status === "confirmed" ? "text-emerald-300 border-emerald-800 bg-emerald-950/30"
    : v?.status === "refuted" ? "text-red-300 border-red-800 bg-red-950/30"
    : v?.status === "inconclusive" ? "text-amber-300 border-amber-800 bg-amber-950/30"
    : "text-zinc-400 border-zinc-800 bg-zinc-900";
  return (
    <button
      type="button"
      onClick={cycle}
      disabled={busy}
      className={clsx("rounded border px-1.5 py-0 text-[9px] font-mono uppercase tracking-wider transition", color)}
      title="click to cycle verification status"
    >
      {busy ? "…" : label}
    </button>
  );
}

function ReviewButtons({ evidence, onChanged }: { evidence: Evidence; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const review = async (decision: "accept" | "reject") => {
    setBusy(true);
    try {
      await reviewEvidence(evidence.id, decision);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex gap-1">
      <button type="button" onClick={() => review("accept")} disabled={busy}
        className="rounded border border-emerald-800 bg-emerald-950/30 text-emerald-300 px-1 py-0 text-[9px] font-mono uppercase hover:bg-emerald-900/40 disabled:opacity-50">
        ✓ accept
      </button>
      <button type="button" onClick={() => review("reject")} disabled={busy}
        className="rounded border border-red-800 bg-red-950/30 text-red-300 px-1 py-0 text-[9px] font-mono uppercase hover:bg-red-900/40 disabled:opacity-50">
        ✕ reject
      </button>
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
