import clsx from "clsx";
import type { ChainSummary } from "../lib/types";
import { CATEGORY_COLOR, SEVERITY_COLOR } from "../lib/style";

export function ChainList({
  chains,
  selectedId,
  onSelect,
}: {
  chains: ChainSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
      {chains.length === 0 && (
        <div className="p-6 text-center text-xs text-zinc-500">no chains match the current filters.</div>
      )}
      <ul className="divide-y divide-zinc-900">
        {chains.map((c) => {
          const selected = c.id === selectedId;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={clsx(
                  "w-full text-left px-3 py-2 hover:bg-zinc-900/70 transition flex flex-col gap-1 border-l-2",
                  selected ? "bg-zinc-900 border-amber-500" : "border-transparent",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: CATEGORY_COLOR[c.category] }}
                    title={c.category}
                  />
                  <span className="font-mono text-[11px] text-zinc-300 shrink-0">{c.id}</span>
                  <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${SEVERITY_COLOR[c.severity]}30`, color: SEVERITY_COLOR[c.severity] }}>
                    {c.severityScore}
                  </span>
                </div>
                <div className="text-[12px] text-zinc-100 truncate">{c.family}</div>
                <div className="text-[11px] text-zinc-500 line-clamp-2">{c.summary}</div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-600 font-mono">
                  <span>{c.source}</span>
                  <span>·</span>
                  <span>{c.nodeCount} nodes</span>
                  <span>·</span>
                  <span className="truncate" title={c.seedIocValue}>
                    {c.seedIocType}:{shorten(c.seedIocValue)}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function shorten(s: string, n = 40): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
