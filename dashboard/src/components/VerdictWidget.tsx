import { useState } from "react";
import clsx from "clsx";
import type { Chain, Verdict } from "../lib/types";
import { setVerdict } from "../lib/data";

const VERDICT_COLOR: Record<Verdict, string> = {
  pending: "#71717a",
  malicious: "#dc2626",
  benign: "#16a34a",
  inconclusive: "#ca8a04",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  pending: "PENDING",
  malicious: "MALICIOUS",
  benign: "BENIGN",
  inconclusive: "INCONCLUSIVE",
};

export function VerdictWidget({
  chain,
  onChanged,
}: {
  chain: Chain;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState(false);
  const [draft, setDraft] = useState(chain.verdict.notesMd ?? "");
  const [error, setError] = useState<string | null>(null);

  const v = chain.verdict;
  const color = VERDICT_COLOR[v.verdict];
  const agentInitial = v.agentInitial;
  const wasFlipped = v.source === "flipped";
  const wouldBeFlip = (next: Verdict) =>
    agentInitial !== null && agentInitial !== next && next !== "pending";

  const submit = async (next: Verdict, notesOverride?: string) => {
    setError(null);
    setBusy(true);
    try {
      await setVerdict(chain.id, { verdict: next, notes: notesOverride ?? draft });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-md border p-2.5 mb-2"
      style={{
        borderColor: color,
        background: `linear-gradient(180deg, ${color}18, transparent 60%)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: color, color: "#0a0a0a" }}
        >
          verdict
        </span>
        <span className="font-mono text-[13px] font-semibold" style={{ color }}>
          {VERDICT_LABEL[v.verdict]}
        </span>
        {v.agentConfidence != null && (
          <span className="text-[10px] font-mono text-zinc-500">
            agent confidence {(v.agentConfidence * 100).toFixed(0)}%
          </span>
        )}
        {wasFlipped && (
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300" title="reviewer flipped the agent's verdict">
            ⚐ flipped
          </span>
        )}
      </div>
      {(v.source || agentInitial) && (
        <div className="mt-1 text-[10px] font-mono text-zinc-500 flex items-center gap-2 flex-wrap">
          {agentInitial && agentInitial !== v.verdict && (
            <span>agent originally: <span className="text-zinc-300">{agentInitial}</span></span>
          )}
          {v.source && <span>source: <span className="text-zinc-300">{v.source}</span></span>}
          {v.setBy && <span>by {v.setBy.kind}:{v.setBy.id}</span>}
          {v.setAt && <span>at {new Date(v.setAt).toLocaleString()}</span>}
        </div>
      )}
      {error && (
        <div className="mt-1.5 text-[11px] text-red-300">{error}</div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <VerdictBtn label="✓ malicious"  disabled={busy} active={v.verdict === "malicious"}
          tone="malicious" flip={wouldBeFlip("malicious")}
          onClick={() => submit("malicious")} />
        <VerdictBtn label="✕ benign"     disabled={busy} active={v.verdict === "benign"}
          tone="benign" flip={wouldBeFlip("benign")}
          onClick={() => submit("benign")} />
        <VerdictBtn label="? inconclusive" disabled={busy} active={v.verdict === "inconclusive"}
          tone="inconclusive" flip={wouldBeFlip("inconclusive")}
          onClick={() => submit("inconclusive")} />
        <VerdictBtn label="— pending"    disabled={busy} active={v.verdict === "pending"}
          tone="pending"
          onClick={() => submit("pending")} />
        <button
          type="button"
          onClick={() => setExpandedNotes((x) => !x)}
          className="ml-auto text-[10px] font-mono text-zinc-400 hover:text-zinc-100"
        >
          {expandedNotes ? "hide notes" : v.notesMd ? "show notes" : "+ note"}
        </button>
      </div>
      {expandedNotes && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="reasoning / context (markdown, saved with verdict)"
            rows={3}
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 font-mono"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(v.verdict, draft)}
              className="text-[10px] font-mono rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-2 py-0.5 text-zinc-50"
            >
              save note (keep verdict)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VerdictBtn({
  label,
  active,
  disabled,
  flip,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  flip?: boolean;
  tone: Verdict;
  onClick: () => void;
}) {
  const baseColor = VERDICT_COLOR[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={flip ? "this would FLIP the agent's verdict" : undefined}
      className={clsx(
        "rounded border px-2 py-0.5 text-[11px] font-mono transition disabled:opacity-50",
        active ? "shadow-sm" : "hover:bg-zinc-900",
      )}
      style={{
        borderColor: active ? baseColor : "#3f3f46",
        background: active ? `${baseColor}30` : "transparent",
        color: active ? baseColor : "#a1a1aa",
      }}
    >
      {flip && !active && <span className="mr-1">⚐</span>}
      {label}
    </button>
  );
}
