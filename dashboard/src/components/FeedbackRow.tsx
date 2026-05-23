import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  getEvidenceFeedback,
  getNodeFeedback,
  postEvidenceFeedback,
  postNodeFeedback,
} from "../lib/data";

interface Item {
  id: number;
  decision: string;
  notesMd: string | null;
  createdAt: string;
  createdBy: { kind: "user" | "agent"; id: string };
}

export function FeedbackRow({
  kind,
  entityId,
  onChanged,
  compact,
}: {
  kind: "node" | "evidence";
  entityId: string;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const loader = kind === "node" ? getNodeFeedback : getEvidenceFeedback;
  const poster = kind === "node" ? postNodeFeedback : postEvidenceFeedback;

  useEffect(() => {
    let cancelled = false;
    loader(entityId).then((r) => { if (!cancelled) setItems(r as Item[]); }).catch(() => setItems([]));
    return () => { cancelled = true; };
  }, [entityId, loader]);

  const submit = async (decision: "agree" | "disagree" | "edit" | "note_only") => {
    setBusy(true);
    try {
      await poster(entityId, { decision, notesMd: draft || undefined });
      setDraft("");
      const fresh = await loader(entityId);
      setItems(fresh as Item[]);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const counts = items.reduce(
    (acc, it) => ((acc[it.decision] = (acc[it.decision] ?? 0) + 1), acc),
    {} as Record<string, number>,
  );

  return (
    <div className={clsx("rounded border border-zinc-800 bg-zinc-950/50", compact ? "p-1" : "p-1.5")}>
      <div className="flex items-center gap-1 flex-wrap">
        <FeedbackBtn icon="✓" label="agree" disabled={busy} tone="emerald" onClick={() => submit("agree")} />
        <FeedbackBtn icon="✕" label="disagree" disabled={busy} tone="red" onClick={() => submit("disagree")} />
        <FeedbackBtn icon="✎" label="edit" disabled={busy} tone="amber" onClick={() => submit("edit")} />
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          className="text-[10px] font-mono text-zinc-500 hover:text-zinc-100 px-1"
        >
          {open ? "−" : "+"} note ({items.length})
        </button>
        {Object.entries(counts).length > 0 && (
          <span className="ml-auto text-[9px] font-mono text-zinc-600">
            {Object.entries(counts).map(([k, v]) => `${k}·${v}`).join(" ")}
          </span>
        )}
      </div>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {items.length > 0 && (
            <div className="space-y-0.5 max-h-32 overflow-y-auto scroll-thin">
              {items.map((it) => (
                <div key={it.id} className="rounded bg-zinc-900/60 border border-zinc-900 px-1.5 py-1 text-[11px]">
                  <div className="flex items-center gap-1.5 font-mono text-[9px] text-zinc-500">
                    <span className={clsx(
                      it.decision === "agree" ? "text-emerald-400" :
                      it.decision === "disagree" ? "text-red-400" :
                      it.decision === "edit" ? "text-amber-400" : "text-zinc-400"
                    )}>{it.decision}</span>
                    <span className={clsx(it.createdBy.kind === "agent" ? "text-amber-400" : "text-emerald-400")}>
                      {it.createdBy.kind}:{it.createdBy.id}
                    </span>
                    <span className="ml-auto">{new Date(it.createdAt).toLocaleString()}</span>
                  </div>
                  {it.notesMd && <div className="mt-0.5 whitespace-pre-wrap text-zinc-300">{it.notesMd}</div>}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="add a note (then click a button above to record decision + note)"
              rows={2}
              className="flex-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => submit("note_only")}
              className="text-[10px] font-mono rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-2 py-1"
            >
              note only
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedbackBtn({
  icon, label, disabled, tone, onClick,
}: {
  icon: string;
  label: string;
  disabled: boolean;
  tone: "emerald" | "red" | "amber";
  onClick: () => void;
}) {
  const color =
    tone === "emerald" ? "border-emerald-800 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40"
    : tone === "red"   ? "border-red-800 bg-red-950/30 text-red-300 hover:bg-red-900/40"
    :                    "border-amber-800 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded border px-1.5 py-0 text-[10px] font-mono disabled:opacity-50 inline-flex items-center gap-1",
        color,
      )}
    >
      <span>{icon}</span>{label}
    </button>
  );
}
