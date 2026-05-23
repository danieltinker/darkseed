import { useEffect, useMemo, useState } from "react";
import { invalidateChain, invalidateIndex, loadChain, loadIndex } from "./lib/data";
import type { Chain, ChainSummary, Index } from "./lib/types";
import { Stats } from "./components/Stats";
import { Filters, type FilterState } from "./components/Filters";
import { ChainList } from "./components/ChainList";
import { ChainGraph } from "./components/ChainGraph";
import { EvidencePanel } from "./components/EvidencePanel";
import { EdgeEditor, NodeEditor } from "./components/NodeEditor";
import { EvidenceUpload } from "./components/EvidenceUpload";
import { NewChainModal, QueuePanel } from "./components/QueuePanel";
import { KbPanel } from "./components/KbPanel";
import { ReportsPanel } from "./components/ReportsPanel";

const EMPTY_FILTERS: FilterState = {
  query: "",
  categories: new Set(),
  severities: new Set(),
  source: "all",
  family: "all",
};

type ModalKind =
  | { kind: "none" }
  | { kind: "addChild"; parentNodeId: string }
  | { kind: "addRoot" }
  | { kind: "editNode" }
  | { kind: "uploadEvidence" }
  | { kind: "connect" }
  | { kind: "queue" }
  | { kind: "newChain" }
  | { kind: "kb" }
  | { kind: "reports" };

export function App() {
  const [index, setIndex] = useState<Index | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>({ kind: "none" });
  const [refreshSeq, setRefreshSeq] = useState(0);

  const refreshIndex = () => {
    invalidateIndex();
    loadIndex(true).then(setIndex).catch((err: Error) => setLoadError(err.message));
  };
  const refreshChain = () => {
    if (selectedChainId) {
      invalidateChain(selectedChainId);
      setRefreshSeq((n) => n + 1);
    }
  };

  useEffect(() => {
    loadIndex().then(setIndex).catch((err: Error) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedChainId) {
      setChain(null);
      setSelectedNodeId(null);
      return;
    }
    let cancelled = false;
    loadChain(selectedChainId, refreshSeq > 0).then((c) => {
      if (cancelled) return;
      setChain(c);
      setSelectedNodeId((cur) => {
        if (cur && c.nodes.some((n) => n.id === cur)) return cur;
        return c.nodes[0]?.id ?? null;
      });
    }).catch((err: Error) => setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [selectedChainId, refreshSeq]);

  const filtered = useMemo<ChainSummary[]>(() => {
    if (!index) return [];
    const q = filters.query.trim().toLowerCase();
    return index.chains.filter((c) => {
      if (filters.categories.size > 0 && !filters.categories.has(c.category)) return false;
      if (filters.severities.size > 0 && !filters.severities.has(c.severity)) return false;
      if (filters.source !== "all" && c.source !== filters.source) return false;
      if (filters.family !== "all" && c.family !== filters.family) return false;
      if (q) {
        const hay = `${c.id} ${c.family} ${c.summary} ${c.seedIocValue} ${c.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [index, filters]);

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md rounded border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">
          <div className="font-mono text-xs text-red-400 mb-1">load error</div>
          {loadError}
          <div className="mt-3 text-xs text-zinc-400">
            Make sure the api is running (<code className="font-mono bg-zinc-900 px-1 rounded">pnpm api:dev</code>)
            and the DB is populated (<code className="font-mono bg-zinc-900 px-1 rounded">pnpm migrate</code>).
          </div>
        </div>
      </div>
    );
  }
  if (!index) {
    return <div className="h-full flex items-center justify-center text-sm text-zinc-500">loading index…</div>;
  }

  const node = chain?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const onPrev = () => {
    if (!chain || !node) return;
    const i = chain.nodes.indexOf(node);
    if (i > 0) setSelectedNodeId(chain.nodes[i - 1]!.id);
  };
  const onNext = () => {
    if (!chain || !node) return;
    const i = chain.nodes.indexOf(node);
    if (i < chain.nodes.length - 1) setSelectedNodeId(chain.nodes[i + 1]!.id);
  };
  const openChain = (chainId: string, nodeId?: string) => {
    setSelectedChainId(chainId);
    if (nodeId) setSelectedNodeId(nodeId);
    setModal({ kind: "none" });
  };

  return (
    <div className="h-full flex flex-col">
      <Stats
        index={index}
        onOpenQueue={() => setModal({ kind: "queue" })}
        onNewChain={() => setModal({ kind: "newChain" })}
        onOpenKb={() => setModal({ kind: "kb" })}
        onOpenReports={() => setModal({ kind: "reports" })}
      />
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: "320px 1fr 420px" }}>
        <aside className="border-r border-zinc-800 flex flex-col min-h-0">
          <Filters
            state={filters}
            onChange={setFilters}
            families={index.families}
            sources={index.sources}
          />
          <div className="px-3 py-1.5 text-[10px] text-zinc-500 font-mono border-b border-zinc-800">
            {filtered.length} of {index.total} chains
          </div>
          <ChainList
            chains={filtered}
            selectedId={selectedChainId}
            onSelect={(id) => setSelectedChainId(id)}
          />
        </aside>
        <main className="flex flex-col min-h-0">
          {chain ? (
            <ChainGraph
              chain={chain}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onAddChild={(parentId) => setModal({ kind: "addChild", parentNodeId: parentId })}
              onAddRoot={() => setModal({ kind: "addRoot" })}
              onConnectNodes={() => setModal({ kind: "connect" })}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-500 px-4 text-center">
              Select a chain from the list to render its kill-chain node graph.
            </div>
          )}
        </main>
        <aside className="border-l border-zinc-800 min-h-0">
          {chain ? (
            <EvidencePanel
              chain={chain}
              node={node}
              onPrev={onPrev}
              onNext={onNext}
              onSelectChain={openChain}
              onSelectNode={setSelectedNodeId}
              onChanged={refreshChain}
              onEditNode={node ? () => setModal({ kind: "editNode" }) : undefined}
              onAttachEvidence={node ? () => setModal({ kind: "uploadEvidence" }) : undefined}
            />
          ) : (
            <div className="h-full flex items-center justify-center p-4 text-center text-sm text-zinc-600">
              chain not loaded.
            </div>
          )}
        </aside>
      </div>

      {/* Modals */}
      {modal.kind === "addChild" && chain && (
        <NodeEditor
          mode="create"
          chainId={chain.id}
          parentNodeId={modal.parentNodeId}
          onClose={() => setModal({ kind: "none" })}
          onSaved={() => { refreshChain(); refreshIndex(); }}
        />
      )}
      {modal.kind === "addRoot" && chain && (
        <NodeEditor
          mode="create"
          chainId={chain.id}
          onClose={() => setModal({ kind: "none" })}
          onSaved={() => { refreshChain(); refreshIndex(); }}
        />
      )}
      {modal.kind === "editNode" && chain && node && (
        <NodeEditor
          mode="edit"
          chainId={chain.id}
          initial={node}
          onClose={() => setModal({ kind: "none" })}
          onSaved={() => { refreshChain(); refreshIndex(); }}
        />
      )}
      {modal.kind === "uploadEvidence" && node && (
        <EvidenceUpload
          nodeId={node.id}
          onClose={() => setModal({ kind: "none" })}
          onSaved={() => { refreshChain(); }}
        />
      )}
      {modal.kind === "connect" && chain && (
        <EdgeEditor
          chainId={chain.id}
          nodes={chain.nodes}
          onClose={() => setModal({ kind: "none" })}
          onSaved={() => { refreshChain(); }}
        />
      )}
      {modal.kind === "queue" && (
        <QueuePanel
          onClose={() => setModal({ kind: "none" })}
          onOpenChain={openChain}
        />
      )}
      {modal.kind === "newChain" && (
        <NewChainModal
          onClose={() => setModal({ kind: "none" })}
          onCreated={(id) => { refreshIndex(); setSelectedChainId(id); }}
        />
      )}
      {modal.kind === "kb" && (
        <KbPanel onClose={() => setModal({ kind: "none" })} />
      )}
      {modal.kind === "reports" && (
        <ReportsPanel
          onClose={() => setModal({ kind: "none" })}
          onOpenChain={(id) => openChain(id)}
        />
      )}
    </div>
  );
}
