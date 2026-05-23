import { useEffect, useState } from "react";
import clsx from "clsx";
import { Modal } from "./NodeEditor";
import { deleteIndicator, loadKb, promoteIoc } from "../lib/data";
import type { Indicator } from "../lib/types";

export function KbPanel({ onClose }: { onClose: () => void }) {
  const [polarity, setPolarity] = useState<"" | "benign" | "malicious">("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ counts: { benign: number; malicious: number }; items: Indicator[] } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const reload = async () => {
    const r = await loadKb({
      polarity: polarity || undefined,
      type: type || undefined,
      q: q || undefined,
    });
    setData(r);
  };
  useEffect(() => { reload(); }, [polarity, type, q]);

  return (
    <Modal title="Indicator KB" onClose={onClose} wide>
      <div className="space-y-3 text-[12px]">
        <div className="flex gap-1.5 items-center flex-wrap">
          <FilterPill active={polarity === ""} onClick={() => setPolarity("")}>all</FilterPill>
          <FilterPill active={polarity === "benign"} onClick={() => setPolarity("benign")} tone="ok">
            benign {data?.counts.benign ?? 0}
          </FilterPill>
          <FilterPill active={polarity === "malicious"} onClick={() => setPolarity("malicious")} tone="bad">
            malicious {data?.counts.malicious ?? 0}
          </FilterPill>
          <span className="h-4 w-px bg-zinc-800 mx-1" />
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px]">
            <option value="">all types</option>
            {["package", "domain", "ip", "sha256", "md5", "cert", "ja3", "elf", "url", "phone", "email"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search value or notes…"
            className="flex-1 min-w-[160px] rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px]"
          />
        </div>
        {data && (
          <div className="rounded border border-zinc-800">
            <table className="w-full text-[11px] font-mono">
              <thead className="text-zinc-500 bg-zinc-950 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">polarity</th>
                  <th className="text-left px-2 py-1">type</th>
                  <th className="text-left px-2 py-1">value</th>
                  <th className="text-left px-2 py-1">category</th>
                  <th className="text-right px-2 py-1">conf</th>
                  <th className="text-left px-2 py-1">source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                    <td className="px-2 py-1">
                      <span className={clsx(
                        "rounded px-1.5 py-0.5 text-[9px] uppercase",
                        i.polarity === "benign" ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300",
                      )}>
                        {i.polarity}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-amber-300">{i.type}</td>
                    <td className="px-2 py-1 text-zinc-200 break-all max-w-[420px]">{i.value}</td>
                    <td className="px-2 py-1 text-zinc-500">{i.category ?? "—"}</td>
                    <td className="px-2 py-1 text-right text-zinc-500">{i.confidence.toFixed(2)}</td>
                    <td className="px-2 py-1 text-zinc-500 max-w-[140px] truncate" title={i.source ?? ""}>{i.source ?? "—"}</td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        disabled={busy === i.id}
                        onClick={async () => {
                          if (!confirm(`Delete indicator ${i.type}:${i.value}?`)) return;
                          setBusy(i.id);
                          await deleteIndicator(i.id);
                          await reload();
                          setBusy(null);
                        }}
                        className="text-zinc-600 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-4 text-zinc-600 text-[11px]">no indicators match</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[11px] text-zinc-500">
          Seed pools live at <code className="text-amber-300">data/kb-seed/benign.json</code> and{" "}
          <code className="text-amber-300">data/kb-seed/malicious.json</code>.
          Run <code className="text-amber-300">pnpm kb:seed</code> to import.
        </div>
      </div>
    </Modal>
  );
}

function FilterPill({
  active, onClick, children, tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "ok" | "bad";
}) {
  const color = tone === "ok" ? "border-emerald-700" : tone === "bad" ? "border-red-700" : "border-zinc-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded border px-2 py-0.5 text-[11px] transition",
        active ? `${color} bg-zinc-800 text-zinc-50` : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

// Inline button to promote a single IOC from a chain's IOCs tab
export function PromoteButton({
  type,
  value,
  onPromoted,
}: {
  type: string;
  value: string;
  onPromoted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[9px] font-mono uppercase border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-amber-600 hover:text-amber-300 rounded px-1 py-0.5"
        title="promote to indicator KB"
      >
        ↑KB
      </button>
      {open && (
        <PromoteModal
          type={type}
          value={value}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); onPromoted?.(); }}
        />
      )}
    </>
  );
}

function PromoteModal({
  type, value, onClose, onDone,
}: {
  type: string; value: string; onClose: () => void; onDone: () => void;
}) {
  const [polarity, setPolarity] = useState<"benign" | "malicious">("malicious");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await promoteIoc({ type, value, polarity, category: category || undefined, notesMd: notes || undefined });
      if (r.flipped) alert(`Indicator was promoted but its polarity flipped (was the opposite before).`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Promote IOC to KB" onClose={onClose}>
      <div className="space-y-2 text-[12px]">
        {error && <div className="rounded border border-red-900 bg-red-950/30 text-red-200 px-2 py-1">{error}</div>}
        <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[11px]">
          <span className="text-amber-300">{type}</span> <span className="text-zinc-200 break-all">{value}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">polarity</span>
            <select value={polarity} onChange={(e) => setPolarity(e.target.value as "benign" | "malicious")}
              className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
              <option value="malicious">malicious</option>
              <option value="benign">benign</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">category (optional)</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="riskware / toll_fraud / phishing / infra / sdk"
              className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1" />
          </label>
        </div>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">notes (optional, markdown)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-zinc-800 bg-zinc-900 hover:border-zinc-600 px-2 py-1">cancel</button>
          <button type="button" onClick={submit} disabled={busy}
            className="rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1 text-zinc-50">
            {busy ? "saving…" : "promote"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
