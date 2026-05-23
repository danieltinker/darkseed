import clsx from "clsx";
import type { Category, Severity } from "../lib/types";
import { CATEGORY_COLOR, CATEGORY_LABEL, SEVERITY_COLOR } from "../lib/style";

export interface FilterState {
  query: string;
  categories: Set<Category>;
  severities: Set<Severity>;
  source: string | "all";
  family: string | "all";
}

const ALL_CATS: Category[] = ["riskware", "toll_fraud", "phishing"];
const ALL_SEVS: Severity[] = ["critical", "high", "medium", "low"];

export function Filters({
  state,
  onChange,
  families,
  sources,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  families: string[];
  sources: string[];
}) {
  const toggleCat = (c: Category) => {
    const next = new Set(state.categories);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    onChange({ ...state, categories: next });
  };
  const toggleSev = (s: Severity) => {
    const next = new Set(state.severities);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onChange({ ...state, severities: next });
  };

  return (
    <div className="px-3 py-2 border-b border-zinc-800 space-y-2 bg-zinc-950">
      <input
        value={state.query}
        onChange={(e) => onChange({ ...state, query: e.target.value })}
        placeholder="Search id / family / IOC / tag…"
        className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
      />
      <div className="flex flex-wrap gap-1">
        {ALL_CATS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => toggleCat(c)}
            className={clsx(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition",
              state.categories.has(c)
                ? "border-zinc-600 bg-zinc-800 text-zinc-50"
                : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-200",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY_COLOR[c] }} />
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {ALL_SEVS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleSev(s)}
            className={clsx(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition capitalize",
              state.severities.has(s)
                ? "border-zinc-600 bg-zinc-800 text-zinc-50"
                : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-200",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_COLOR[s] }} />
            {s}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select
          label="source"
          value={state.source}
          onChange={(v) => onChange({ ...state, source: v })}
          options={["all", ...sources]}
        />
        <Select
          label="family"
          value={state.family}
          onChange={(v) => onChange({ ...state, family: v })}
          options={["all", ...families]}
        />
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
