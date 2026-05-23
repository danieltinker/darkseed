import { useEffect, useState } from "react";
import { Modal } from "./NodeEditor";
import { loadQueue, reviewEvidence } from "../lib/data";

export function QueuePanel({
  onClose,
  onOpenChain,
}: {
  onClose: () => void;
  onOpenChain: (chainId: string, nodeId: string) => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadQueue>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    setData(await loadQueue());
  };
  useEffect(() => { refresh(); }, []);

  return (
    <Modal title="Review queue" onClose={onClose} wide>
      <div className="space-y-3 text-[12px]">
        <div className="text-[11px] text-zinc-400">
          Suggestions from agents awaiting human review. Accepting a proposal records a positive
          training signal; rejecting records a negative one. Both feed{" "}
          <span className="font-mono text-amber-300">labels.jsonl</span>.
        </div>

        <Section title={`Proposed nodes (${data?.nodes.length ?? 0})`}>
          {data?.nodes.length === 0 ? (
            <Empty msg="no node proposals — agents haven't suggested anything yet" />
          ) : (
            <ul className="space-y-1">
              {(data?.nodes ?? []).map((n) => (
                <li key={n.id} className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-amber-300">{n.techniqueId}</span>
                    <span className="text-[12px] text-zinc-100 truncate flex-1">{n.title}</span>
                    <span className="text-[10px] font-mono text-zinc-500">{n.tactic}</span>
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 mt-0.5 flex items-center gap-2">
                    <span>{n.chainCategory}/{n.chainFamily}</span>
                    <span>·</span>
                    <span>proposed by {n.proposedBy.kind}:{n.proposedBy.id}</span>
                    <span>·</span>
                    <span>{new Date(n.proposedAt).toLocaleString()}</span>
                    <button type="button" onClick={() => onOpenChain(n.chainId, n.nodeId)}
                      className="ml-auto rounded border border-zinc-800 hover:border-amber-600 px-1.5 py-0.5 text-zinc-300">
                      open ↗
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Proposed evidence (${data?.evidence.length ?? 0})`}>
          {data?.evidence.length === 0 ? (
            <Empty msg="no evidence proposals" />
          ) : (
            <ul className="space-y-1">
              {(data?.evidence ?? []).map((e) => (
                <li key={e.id} className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase text-amber-300">{e.kind}</span>
                    <span className="text-[12px] text-zinc-100 truncate flex-1">{e.label}</span>
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate mt-0.5">{e.value}</div>
                  <div className="text-[10px] font-mono text-zinc-500 mt-0.5 flex items-center gap-2">
                    <span>{e.chainFamily}</span>
                    <span>·</span>
                    <span>{e.proposedBy.kind}:{e.proposedBy.id}</span>
                    <span className="ml-auto inline-flex gap-1">
                      <button type="button" disabled={busy === e.id} onClick={async () => {
                        setBusy(e.id); await reviewEvidence(e.id, "accept"); await refresh(); setBusy(null);
                      }} className="rounded border border-emerald-800 bg-emerald-950/30 text-emerald-300 px-1.5 py-0.5">
                        ✓ accept
                      </button>
                      <button type="button" disabled={busy === e.id} onClick={async () => {
                        setBusy(e.id); await reviewEvidence(e.id, "reject"); await refresh(); setBusy(null);
                      }} className="rounded border border-red-800 bg-red-950/30 text-red-300 px-1.5 py-0.5">
                        ✕ reject
                      </button>
                      <button type="button" onClick={() => onOpenChain(e.chainId, e.nodeId)}
                        className="rounded border border-zinc-800 hover:border-amber-600 px-1.5 py-0.5 text-zinc-300">
                        open ↗
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">{title}</h4>
      {children}
    </div>
  );
}
function Empty({ msg }: { msg: string }) {
  return <div className="rounded border border-dashed border-zinc-800 p-4 text-center text-[11px] text-zinc-600">{msg}</div>;
}

// ---------------------------------------------------------------------------
// New chain modal
// ---------------------------------------------------------------------------

export function NewChainModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (chainId: string) => void;
}) {
  const [category, setCategory] = useState<"riskware" | "toll_fraud" | "phishing">("phishing");
  const [family, setFamily] = useState("");
  const [seedType, setSeedType] = useState<"url" | "sha256" | "domain" | "package" | "ip">("url");
  const [seedValue, setSeedValue] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!family.trim() || !seedValue.trim()) { setError("family + seed value required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/chains", {
        method: "POST",
        headers: { "content-type": "application/json", "x-actor-kind": "user", "x-actor-id": "researcher" },
        body: JSON.stringify({
          category, family, source: "manual",
          seedIoc: { type: seedType, value: seedValue, source: "manual" },
          summary, tags: ["manual"],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json() as { id: string };
      onCreated(json.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New chain" onClose={onClose}>
      <div className="space-y-2 text-[12px]">
        {error && <div className="rounded border border-red-900 bg-red-950/30 text-red-200 px-2 py-1">{error}</div>}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}
              className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
              <option value="riskware">riskware</option>
              <option value="toll_fraud">toll_fraud</option>
              <option value="phishing">phishing</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">family</span>
            <input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="e.g. FluBot"
              className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1" />
          </label>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">seed type</span>
            <select value={seedType} onChange={(e) => setSeedType(e.target.value as typeof seedType)}
              className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
              <option value="url">url</option>
              <option value="domain">domain</option>
              <option value="sha256">sha256</option>
              <option value="package">package</option>
              <option value="ip">ip</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">seed value</span>
            <input value={seedValue} onChange={(e) => setSeedValue(e.target.value)} placeholder="paste an IOC"
              className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono" />
          </label>
        </div>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">summary</span>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="one-line description"
            className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded border border-zinc-800 bg-zinc-900 hover:border-zinc-600 px-2 py-1">cancel</button>
          <button type="button" onClick={submit} disabled={busy}
            className="rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1 text-zinc-50">
            {busy ? "creating…" : "create chain"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
