import clsx from "clsx";
import type { Index } from "../lib/types";
import { CATEGORY_COLOR, CATEGORY_LABEL, SEVERITY_COLOR } from "../lib/style";

export function Stats({
  index,
  onOpenQueue,
  onNewChain,
  onOpenKb,
  onOpenReports,
}: {
  index: Index;
  onOpenQueue: () => void;
  onNewChain: () => void;
  onOpenKb: () => void;
  onOpenReports: () => void;
}) {
  const cats = Object.entries(index.byCategory) as [keyof typeof CATEGORY_LABEL, number][];
  const sevs = Object.entries(index.bySeverity) as [keyof typeof SEVERITY_COLOR, number][];
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur flex-wrap">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-amber-400 text-lg font-semibold tracking-tight">darkseed</span>
        <span className="text-zinc-500 text-xs">researcher × agent workbench</span>
      </div>
      <Sep />
      <div className="text-xs text-zinc-400">
        <span className="text-zinc-200 font-mono">{index.total}</span> chains ·{" "}
        <span className="text-zinc-200 font-mono">{index.families.length}</span> families ·{" "}
        <span className="text-zinc-200 font-mono">{index.sources.length}</span> sources
      </div>
      <Sep />
      <div className="flex items-center gap-1.5">
        {cats.map(([cat, n]) => (
          <Chip key={cat} dot={CATEGORY_COLOR[cat]} glyph={glyphForCategory(cat)} label={CATEGORY_LABEL[cat]} value={n} />
        ))}
      </div>
      <Sep />
      <div className="flex items-center gap-1.5">
        {sevs.map(([sev, n]) => (
          <Chip key={sev} dot={SEVERITY_COLOR[sev]} label={sev} value={n} />
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenReports}
          className="rounded border border-zinc-700 bg-zinc-900 hover:border-amber-600 hover:text-amber-200 px-2 py-1 text-[11px]"
          title="reports inbox + flip-review"
        >
          ⌥ reports
        </button>
        <button
          type="button"
          onClick={onOpenKb}
          className="rounded border border-zinc-700 bg-zinc-900 hover:border-amber-600 hover:text-amber-200 px-2 py-1 text-[11px]"
          title="indicator KB (benign + malicious pools)"
        >
          ⚓ KB
        </button>
        <button
          type="button"
          onClick={onOpenQueue}
          className="rounded border border-amber-800 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
          title="agent proposal queue"
        >
          ⚑ review queue
        </button>
        <button
          type="button"
          onClick={onNewChain}
          className="rounded border border-zinc-700 bg-zinc-900 hover:border-amber-600 hover:text-amber-200 px-2 py-1 text-[11px]"
        >
          + new chain
        </button>
        <a
          href="/api/export/jsonl"
          className="rounded border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 px-2 py-1 text-[11px]"
          title="export all chains as JSONL"
        >
          ⤓ jsonl
        </a>
        <a
          href="/api/labels.jsonl"
          className="rounded border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 px-2 py-1 text-[11px]"
          title="export training labels"
        >
          ⤓ labels
        </a>
      </div>
    </div>
  );
}

function Sep() {
  return <div className="h-6 w-px bg-zinc-800" />;
}

function Chip({
  dot,
  label,
  value,
  glyph,
}: {
  dot: string;
  label: string;
  value: number;
  glyph?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300",
      )}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {glyph && <span className="font-mono text-[10px] text-zinc-500">{glyph}</span>}
      <span className="capitalize">{label}</span>
      <span className="font-mono text-zinc-100">{value}</span>
    </span>
  );
}

function glyphForCategory(c: string): string {
  if (c === "riskware") return "R";
  if (c === "toll_fraud") return "T";
  if (c === "phishing") return "P";
  return "·";
}
