import { useEffect, useState } from "react";
import clsx from "clsx";
import { Modal } from "./NodeEditor";
import { ingestReportContent, labelReport, loadReport, loadReports } from "../lib/data";
import type { Report } from "../lib/types";

export function ReportsPanel({
  onClose,
  onOpenChain,
}: {
  onClose: () => void;
  onOpenChain: (chainId: string) => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadReports>> | null>(null);
  const [filter, setFilter] = useState<"all" | "flipped" | "pending" | "ingested">("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showIngest, setShowIngest] = useState(false);

  const reload = async () => {
    const r = await loadReports({
      flipped: filter === "flipped",
      status: filter === "pending" ? "pending" : filter === "ingested" ? "ingested" : undefined,
      q: q || undefined,
    });
    setData(r);
  };
  useEffect(() => { reload(); }, [filter, q]);

  return (
    <Modal title="Reports" onClose={onClose} wide>
      <div className="space-y-3 text-[12px]">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
            all {data?.counts.total ?? 0}
          </FilterTab>
          <FilterTab active={filter === "ingested"} onClick={() => setFilter("ingested")}>
            ingested {data?.counts.ingested ?? 0}
          </FilterTab>
          <FilterTab active={filter === "pending"} onClick={() => setFilter("pending")}>
            pending {data?.counts.pending ?? 0}
          </FilterTab>
          <FilterTab active={filter === "flipped"} onClick={() => setFilter("flipped")} tone="amber">
            ⚐ flipped {data?.counts.flipped ?? 0}
          </FilterTab>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search id / filename / frontmatter…"
            className="flex-1 min-w-[160px] rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px]"
          />
          <button type="button" onClick={() => setShowIngest(true)}
            className="rounded border border-amber-700 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40 px-2 py-0.5 text-[11px]">
            + paste .md
          </button>
        </div>

        {filter === "flipped" && (
          <div className="rounded border border-amber-900 bg-amber-950/15 px-2 py-1.5 text-[11px] text-amber-200">
            <strong>Flip-review lane.</strong> Reports where the reviewer disagreed with the source's declared label. These are your highest-signal training rows.
          </div>
        )}

        <div className="rounded border border-zinc-800">
          <table className="w-full text-[11px] font-mono">
            <thead className="text-zinc-500 bg-zinc-950 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1">id</th>
                <th className="text-left px-2 py-1">category</th>
                <th className="text-left px-2 py-1">declared</th>
                <th className="text-left px-2 py-1">effective</th>
                <th className="text-left px-2 py-1">status</th>
                <th className="text-left px-2 py-1">chain</th>
                <th className="text-left px-2 py-1">imported</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r) => (
                <tr key={r.id} className={clsx(
                  "border-t border-zinc-900 cursor-pointer hover:bg-zinc-900/50",
                  selectedId === r.id && "bg-zinc-900",
                )}
                  onClick={() => setSelectedId(r.id)}
                >
                  <td className="px-2 py-1 text-zinc-200">{r.id}</td>
                  <td className="px-2 py-1 text-amber-300">{r.declaredCategory ?? "—"}</td>
                  <td className="px-2 py-1"><LabelPill label={r.declaredLabel} /></td>
                  <td className="px-2 py-1">
                    <LabelPill label={r.effectiveLabel} />
                    {r.flipped && <span className="ml-1 text-amber-300 text-[9px]" title="flipped">⚐</span>}
                  </td>
                  <td className="px-2 py-1 text-zinc-400">{r.status}</td>
                  <td className="px-2 py-1">
                    {r.ingestedChainId ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onOpenChain(r.ingestedChainId!); }}
                        className="text-emerald-300 hover:underline">
                        {r.ingestedChainId.slice(0, 18)}…
                      </button>
                    ) : "—"}
                  </td>
                  <td className="px-2 py-1 text-zinc-500">{new Date(r.importedAt).toLocaleString()}</td>
                </tr>
              ))}
              {!data?.items.length && (
                <tr><td colSpan={7} className="text-center py-6 text-zinc-600">no reports — paste one above or drop into <code className="text-amber-300">data/reports/inbox/</code></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedId && <ReportDetail id={selectedId} onChanged={reload} onOpenChain={onOpenChain} />}
        {showIngest && <IngestModal onClose={() => setShowIngest(false)} onDone={() => { setShowIngest(false); reload(); }} />}
      </div>
    </Modal>
  );
}

function LabelPill({ label }: { label: "tp" | "fp" | null }) {
  if (label === null) return <span className="text-zinc-600">—</span>;
  return (
    <span className={clsx(
      "rounded px-1 py-0 text-[9px] uppercase",
      label === "tp" ? "bg-red-950/40 text-red-300" : "bg-emerald-950/40 text-emerald-300",
    )}>
      {label}
    </span>
  );
}

function FilterTab({ active, onClick, children, tone }: {
  active: boolean; onClick: () => void; children: React.ReactNode; tone?: "amber";
}) {
  const color = tone === "amber" ? "border-amber-700" : "border-zinc-700";
  return (
    <button type="button" onClick={onClick}
      className={clsx(
        "rounded border px-2 py-0.5 text-[11px]",
        active ? `${color} bg-zinc-800 text-zinc-50` : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100",
      )}>
      {children}
    </button>
  );
}

function ReportDetail({
  id, onChanged, onOpenChain,
}: { id: string; onChanged: () => void; onOpenChain: (chainId: string) => void }) {
  const [data, setData] = useState<{ report: Report; bodyMd: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { loadReport(id).then(setData).catch(() => setData(null)); }, [id]);
  if (!data) return null;
  const r = data.report;

  const setLabel = async (effective: "tp" | "fp") => {
    setBusy(true);
    try {
      await labelReport(r.id, { effectiveLabel: effective, notesMd: note || undefined });
      onChanged();
      const fresh = await loadReport(id);
      setData(fresh);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-zinc-800 p-2.5 bg-zinc-950/60 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[11px] text-amber-300">{r.id}</span>
        <span className="text-zinc-500 text-[11px]">{r.filename ?? "(no filename)"}</span>
        <span className="ml-auto flex items-center gap-2 text-[10px] font-mono">
          declared: <LabelPill label={r.declaredLabel} />
          effective: <LabelPill label={r.effectiveLabel} />
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">set effective label:</span>
        <button type="button" disabled={busy} onClick={() => setLabel("tp")}
          className="rounded border border-red-800 bg-red-950/30 text-red-300 hover:bg-red-900/40 disabled:opacity-50 px-2 py-0.5 text-[11px] font-mono">
          tp (malicious)
        </button>
        <button type="button" disabled={busy} onClick={() => setLabel("fp")}
          className="rounded border border-emerald-800 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-50 px-2 py-0.5 text-[11px] font-mono">
          fp (benign)
        </button>
        {r.ingestedChainId && (
          <button type="button" onClick={() => onOpenChain(r.ingestedChainId!)}
            className="ml-auto rounded border border-amber-700 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40 px-2 py-0.5 text-[11px]">
            open ingested chain ↗
          </button>
        )}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="optional flip reasoning (saved as audit + label note)"
        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] font-mono" />
      {data.bodyMd && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-zinc-400 hover:text-zinc-100">show report body ({data.bodyMd.length} chars)</summary>
          <pre className="mt-1.5 max-h-72 overflow-auto scroll-thin rounded bg-zinc-950 border border-zinc-900 p-2 text-zinc-300 whitespace-pre-wrap break-words">
            {data.bodyMd}
          </pre>
        </details>
      )}
    </div>
  );
}

function IngestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const SAMPLE = `---
id: report-sample-001
category: phishing
declared_label: tp
source: researcher-daniel
first_seen: 2026-05-23
tags: [flubot, mobile, smish]
app:
  package_name: com.flubot.banker
  version_name: "1.4.2"
  version_code: 142
  apk_sha256: c0ffee1234567890c0ffee1234567890c0ffee1234567890c0ffee1234567890
  artifact_id: com.flubot.banker
---

# Investigation

Sample observed in the wild via OpenPhish feed. The APK uses **T1660** (mobile phishing) to deliver, **T1626.001** to escalate via accessibility service, then **T1417.002** to overlay banking app login screens. Exfil over **T1646**.

## Indicators

- Domain: relay.bad-actor.invalid
- C2 URL: https://relay.bad-actor.invalid/r
- SHA-256: c0ffee1234567890c0ffee1234567890c0ffee1234567890c0ffee1234567890
- Package: com.flubot.banker

## Verdict

Confirmed malicious. Wallet drainer behavior across 12 victim devices.
`;
  const [text, setText] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await ingestReportContent(text, "pasted.md");
      setResult(`✓ ingested report ${r.reportId} → chain ${r.chainId} (${r.nodeCount} nodes, ${r.iocCount} IOCs)`);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Paste report markdown" onClose={onClose} wide>
      <div className="space-y-2 text-[12px]">
        {err && <div className="rounded border border-red-900 bg-red-950/30 text-red-200 px-2 py-1 text-[11px]">{err}</div>}
        {result && <div className="rounded border border-emerald-800 bg-emerald-950/30 text-emerald-200 px-2 py-1 text-[11px]">{result}</div>}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={20}
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] font-mono" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded border border-zinc-800 bg-zinc-900 hover:border-zinc-600 px-2 py-1">cancel</button>
          <button type="button" onClick={submit} disabled={busy}
            className="rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1 text-zinc-50">
            {busy ? "ingesting…" : "ingest"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
