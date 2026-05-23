import { useEffect, useState } from "react";
import clsx from "clsx";
import type { Chain, ChainNode, Evidence } from "../lib/types";
import { TACTIC_COLOR } from "../lib/style";
import {
  blobUrl,
  deleteEvidence,
  loadAudit,
  loadComments,
  loadSimilar,
  postComment,
  verifyEvidence,
} from "../lib/data";
import { EvidenceCardFull } from "./EvidenceViewers";
import { VerdictWidget } from "./VerdictWidget";
import { FeedbackRow } from "./FeedbackRow";
import { PromoteButton } from "./KbPanel";

type Tab = "overview" | "static" | "dynamic" | "iocs" | "comments" | "similar" | "audit";

export function EvidencePanel({
  chain,
  node,
  onPrev,
  onNext,
  onSelectChain,
  onSelectNode,
  onChanged,
  onEditNode,
  onAttachEvidence,
}: {
  chain: Chain;
  node: ChainNode | null;
  onPrev: () => void;
  onNext: () => void;
  onSelectChain?: (chainId: string, nodeId?: string) => void;
  onSelectNode?: (nodeId: string) => void;
  onChanged?: () => void;
  onEditNode?: () => void;
  onAttachEvidence?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  if (!node) {
    return (
      <div className="h-full p-4 text-sm text-zinc-500 flex items-center justify-center text-center">
        Select a node in the graph to inspect the static + dynamic agent evidence captured at that step.
      </div>
    );
  }
  const color = TACTIC_COLOR[node.tactic];
  const staticEv = node.evidence.filter((e) => e.category === "static");
  const dynamicEv = node.evidence.filter((e) => e.category === "dynamic");
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950/80">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            className="rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
            title="Previous step"
          >
            ◀
          </button>
          <span className="text-[11px] text-zinc-500 font-mono">step {node.step}/{chain.nodes.length}</span>
          <button
            type="button"
            onClick={onNext}
            className="rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
            title="Next step"
          >
            ▶
          </button>
          <span className="ml-auto text-[10px] font-mono text-zinc-500">{node.techniqueId}</span>
          {node.status === "proposed" && (
            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-amber-900/40 text-amber-300" title="proposed by agent">
              proposed
            </span>
          )}
          {onEditNode && (
            <button
              type="button"
              onClick={onEditNode}
              className="rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-100 hover:border-zinc-600"
              title="Edit node"
            >
              ✎
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `${color}22`, color }}
          >
            {node.tactic}
          </span>
          <h3 className="text-sm font-semibold text-zinc-50 leading-tight">{node.title}</h3>
        </div>
        <p className="mt-1.5 text-[12px] text-zinc-400 leading-snug">{node.description}</p>
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
          <span title="provenance">
            by {node.createdBy.kind}:{node.createdBy.id}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 px-3 py-1 border-b border-zinc-800 bg-zinc-950 overflow-x-auto scroll-thin">
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>overview</TabBtn>
        <TabBtn active={tab === "static"} onClick={() => setTab("static")}>
          static <Pill>{staticEv.length}</Pill>
        </TabBtn>
        <TabBtn active={tab === "dynamic"} onClick={() => setTab("dynamic")}>
          dynamic <Pill>{dynamicEv.length}</Pill>
        </TabBtn>
        <TabBtn active={tab === "iocs"} onClick={() => setTab("iocs")}>
          IOCs <Pill>{node.iocs.length}</Pill>
        </TabBtn>
        <TabBtn active={tab === "comments"} onClick={() => setTab("comments")}>comments</TabBtn>
        <TabBtn active={tab === "similar"} onClick={() => setTab("similar")}>similar</TabBtn>
        <TabBtn active={tab === "audit"} onClick={() => setTab("audit")}>audit</TabBtn>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        {tab === "overview" && (
          <Overview chain={chain} node={node} onAttachEvidence={onAttachEvidence} onChanged={onChanged} />
        )}
        {tab === "static" && (
          <EvidenceList
            evidence={staticEv}
            tone="emerald"
            onChanged={onChanged}
          />
        )}
        {tab === "dynamic" && (
          <EvidenceList
            evidence={dynamicEv}
            tone="sky"
            onChanged={onChanged}
          />
        )}
        {tab === "iocs" && <IocsTab node={node} />}
        {tab === "comments" && <CommentsTab nodeId={node.id} />}
        {tab === "similar" && (
          <SimilarTab nodeId={node.id} onSelectChain={onSelectChain} onSelectNode={onSelectNode} />
        )}
        {tab === "audit" && <AuditTab entityType="node" entityId={node.id} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-amber-500",
        active ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center rounded bg-zinc-700/60 text-zinc-200 text-[10px] font-mono px-1 min-w-[18px]">
      {children}
    </span>
  );
}

function Overview({
  chain,
  node,
  onAttachEvidence,
  onChanged,
}: {
  chain: Chain;
  node: ChainNode;
  onAttachEvidence?: () => void;
  onChanged?: () => void;
}) {
  return (
    <div className="p-3 space-y-3 text-[12px]">
      <VerdictWidget chain={chain} onChanged={() => onChanged?.()} />
      <Section title="Per-node feedback">
        <FeedbackRow kind="node" entityId={node.id} onChanged={onChanged} />
      </Section>
      <Section title="Chain context">
        <KV k="chain id" v={chain.id} mono copy={chain.id} />
        <KV k="family" v={chain.family} />
        <KV k="category" v={chain.category} />
        <KV k="source" v={chain.source} />
        <KV k="seed IOC" v={`${chain.seedIoc.type}: ${chain.seedIoc.value}`} mono wrap copy={chain.seedIoc.value} />
        <KV k="severity" v={`${chain.severity} (${chain.severityScore}/100)`} />
        <KV k="status" v={chain.status} />
        {chain.sourceReportId && <KV k="from report" v={chain.sourceReportId} mono />}
        {chain.appId && <KV k="app id (sha256)" v={chain.appId} mono wrap copy={chain.appId} />}
      </Section>
      <Section title="Agent notes">
        {node.agentNotes.staticAgent && (
          <p className="text-zinc-300 leading-snug"><span className="text-emerald-400 font-mono text-[10px] mr-1">[static]</span>{node.agentNotes.staticAgent}</p>
        )}
        {node.agentNotes.dynamicAgent && (
          <p className="text-zinc-300 leading-snug"><span className="text-sky-400 font-mono text-[10px] mr-1">[dynamic]</span>{node.agentNotes.dynamicAgent}</p>
        )}
      </Section>
      {onAttachEvidence && (
        <button
          type="button"
          onClick={onAttachEvidence}
          className="w-full rounded border border-dashed border-zinc-700 hover:border-amber-500 hover:text-amber-200 text-zinc-400 px-3 py-3 text-[12px] transition"
        >
          + attach evidence (drag files, frida trace, HAR, source, image)
        </button>
      )}
    </div>
  );
}

function EvidenceList({
  evidence,
  tone,
  onChanged,
}: {
  evidence: Evidence[];
  tone: "emerald" | "sky";
  onChanged?: () => void;
}) {
  if (evidence.length === 0) {
    return <div className="p-6 text-center text-[11px] text-zinc-600">no evidence at this step</div>;
  }
  const sorted = tone === "sky"
    ? [...evidence].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    : evidence;
  return (
    <div className="p-3 space-y-2">
      {sorted.map((e) => (
        <EvidenceCardFull key={e.id} evidence={e} tone={tone} onChanged={onChanged} />
      ))}
    </div>
  );
}

function IocsTab({ node }: { node: ChainNode }) {
  if (node.iocs.length === 0) return <div className="p-6 text-center text-[11px] text-zinc-600">no IOCs at this step</div>;
  return (
    <div className="p-3">
      <table className="w-full text-[11px] font-mono">
        <thead className="text-zinc-500">
          <tr>
            <th className="text-left pb-1 pr-3">type</th>
            <th className="text-left pb-1 pr-3">value</th>
            <th className="text-left pb-1">source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {node.iocs.map((i, idx) => (
            <tr key={idx} className="border-t border-zinc-900">
              <td className="py-1 pr-3 text-amber-300">{i.type}</td>
              <td className="py-1 pr-3 text-zinc-200 break-all">{i.value}</td>
              <td className="py-1 text-zinc-500">{i.source ?? "—"}</td>
              <td className="py-1 pl-2 flex items-center gap-1 justify-end">
                <PromoteButton type={i.type} value={i.value} />
                <CopyButton text={i.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommentsTab({ nodeId }: { nodeId: string }) {
  const [comments, setComments] = useState<Awaited<ReturnType<typeof loadComments>>>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadComments(nodeId).then(setComments).catch(() => setComments([]));
  }, [nodeId]);

  const submit = async () => {
    const v = draft.trim();
    if (!v) return;
    setBusy(true);
    try {
      await postComment(nodeId, v);
      setDraft("");
      const fresh = await loadComments(nodeId);
      setComments(fresh);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 flex flex-col gap-2 text-[12px]">
      {comments.length === 0 && (
        <div className="text-[11px] text-zinc-600 text-center py-4">no comments yet</div>
      )}
      {comments.map((c) => (
        <div key={c.id} className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-2">
            <span className={clsx(c.createdBy.kind === "agent" ? "text-amber-400" : "text-emerald-400")}>
              {c.createdBy.kind}:{c.createdBy.id}
            </span>
            <span>·</span>
            <span>{new Date(c.createdAt).toLocaleString()}</span>
          </div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-zinc-200 text-[12px]">{c.bodyMd}</pre>
        </div>
      ))}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="add a note (Markdown)…"
        rows={3}
        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !draft.trim()}
        className="self-end rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 text-[12px] text-zinc-50"
      >
        {busy ? "posting…" : "post comment"}
      </button>
    </div>
  );
}

function SimilarTab({
  nodeId,
  onSelectChain,
  onSelectNode,
}: {
  nodeId: string;
  onSelectChain?: (chainId: string, nodeId?: string) => void;
  onSelectNode?: (nodeId: string) => void;
}) {
  const [results, setResults] = useState<Awaited<ReturnType<typeof loadSimilar>>["results"]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    loadSimilar(nodeId)
      .then((r) => setResults(r.results))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [nodeId]);
  if (loading) return <div className="p-6 text-center text-[11px] text-zinc-500">searching…</div>;
  if (results.length === 0) return <div className="p-6 text-center text-[11px] text-zinc-600">no similar nodes found</div>;
  return (
    <div className="p-3 space-y-1">
      <div className="text-[10px] text-zinc-500 mb-1.5">TF-IDF over node + IOC + evidence text. Top {results.length}.</div>
      {results.map((r) => (
        <button
          key={r.nodeId}
          type="button"
          onClick={() => {
            if (onSelectChain) onSelectChain(r.chainId, r.nodeId);
            else if (onSelectNode) onSelectNode(r.nodeId);
          }}
          className="w-full text-left rounded border border-zinc-800 hover:border-amber-600 hover:bg-zinc-900 px-2 py-1.5 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-200 truncate">{r.title}</span>
            <span className="ml-auto text-[10px] font-mono text-amber-300">{r.score.toFixed(3)}</span>
          </div>
          <div className="text-[10px] text-zinc-500 font-mono flex gap-2">
            <span>{r.chainId}</span>
            <span>·</span>
            <span>{r.techniqueId}</span>
            <span>·</span>
            <span>{r.category}/{r.severity}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function AuditTab({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof loadAudit>>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    loadAudit(entityType, entityId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);
  if (loading) return <div className="p-6 text-center text-[11px] text-zinc-500">loading…</div>;
  if (items.length === 0) return <div className="p-6 text-center text-[11px] text-zinc-600">no audit entries</div>;
  return (
    <div className="p-3 space-y-1">
      {items.map((a) => (
        <div key={a.id} className="rounded border border-zinc-900 bg-zinc-950 p-1.5 text-[11px]">
          <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
            <span className={clsx(a.actor.kind === "agent" ? "text-amber-400" : "text-emerald-400")}>{a.actor.id}</span>
            <span>·</span>
            <span className="text-zinc-300">{a.action}</span>
            <span className="ml-auto">{new Date(a.createdAt).toLocaleString()}</span>
          </div>
          {a.diff !== null && a.diff !== undefined ? (
            <pre className="mt-1 text-[10px] text-zinc-500 break-all whitespace-pre-wrap">{JSON.stringify(a.diff, null, 0)}</pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({
  k,
  v,
  mono,
  wrap,
  copy,
}: {
  k: string;
  v: string;
  mono?: boolean;
  wrap?: boolean;
  copy?: string;
}) {
  return (
    <div className="flex text-[12px] gap-2 items-baseline">
      <span className="text-zinc-500 w-24 shrink-0">{k}</span>
      <span
        className={clsx(
          "text-zinc-200 flex-1 min-w-0",
          mono && "font-mono",
          wrap ? "break-all" : "truncate",
        )}
      >
        {v}
      </span>
      {copy && <CopyButton text={copy} />}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className={clsx(
        "shrink-0 rounded border px-1 py-0.5 text-[9px] font-mono uppercase transition",
        copied
          ? "border-emerald-700 bg-emerald-950 text-emerald-300"
          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100",
      )}
      title="copy"
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}

// Re-exports used by EvidenceViewers
export { deleteEvidence, verifyEvidence, blobUrl };
