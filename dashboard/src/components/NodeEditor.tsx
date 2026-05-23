import { useEffect, useState } from "react";
import clsx from "clsx";
import type { ChainNode, Tactic } from "../lib/types";
import { createEdge, createNode, deleteEdge, deleteNode, updateNode } from "../lib/data";

const TACTICS: Tactic[] = [
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Privilege Escalation",
  "Defense Evasion",
  "Credential Access",
  "Discovery",
  "Collection",
  "Command and Control",
  "Exfiltration",
  "Impact",
];

// Trimmed MITRE list — frequent ones for autocomplete suggestion strip.
const MITRE_TECHNIQUES: Array<{ id: string; name: string; tactic: Tactic }> = [
  { id: "T1566.001", name: "Spearphishing Attachment", tactic: "Initial Access" },
  { id: "T1566.002", name: "Spearphishing Link", tactic: "Initial Access" },
  { id: "T1660", name: "Phishing (Mobile)", tactic: "Initial Access" },
  { id: "T1204.001", name: "User Execution: Malicious Link", tactic: "Execution" },
  { id: "T1626.001", name: "Device Administrator Abuse", tactic: "Privilege Escalation" },
  { id: "T1417.001", name: "Input Capture: Keylogging", tactic: "Credential Access" },
  { id: "T1417.002", name: "Input Capture: GUI Overlay", tactic: "Credential Access" },
  { id: "T1429", name: "Audio Capture", tactic: "Collection" },
  { id: "T1430", name: "Location Tracking", tactic: "Collection" },
  { id: "T1636.003", name: "Protected User Data: Contact List", tactic: "Collection" },
  { id: "T1636.004", name: "Protected User Data: SMS Messages", tactic: "Collection" },
  { id: "T1437.001", name: "App Layer Protocol: Web Protocols", tactic: "Command and Control" },
  { id: "T1646", name: "Exfiltration Over C2 Channel", tactic: "Exfiltration" },
  { id: "T1041", name: "Exfiltration Over C2 Channel (Enterprise)", tactic: "Exfiltration" },
  { id: "T1448", name: "Carrier Billing Fraud", tactic: "Impact" },
  { id: "T1657", name: "Financial Theft", tactic: "Impact" },
  { id: "T1582", name: "SMS Control", tactic: "Defense Evasion" },
  { id: "T1517", name: "Access Notifications", tactic: "Collection" },
  { id: "T1407", name: "Download New Code at Runtime", tactic: "Defense Evasion" },
  { id: "T1475", name: "Authorized App Store Delivery", tactic: "Initial Access" },
  { id: "T1476", name: "Other-means App Delivery", tactic: "Initial Access" },
];

export interface NodeEditorProps {
  mode: "create" | "edit";
  chainId: string;
  parentNodeId?: string;
  initial?: ChainNode;
  asProposal?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function NodeEditor(props: NodeEditorProps) {
  const isEdit = props.mode === "edit";
  const [title, setTitle] = useState(props.initial?.title ?? "");
  const [description, setDescription] = useState(props.initial?.description ?? "");
  const [techniqueId, setTechniqueId] = useState(props.initial?.techniqueId ?? "");
  const [techniqueName, setTechniqueName] = useState(props.initial?.techniqueName ?? "");
  const [tactic, setTactic] = useState<Tactic>(props.initial?.tactic ?? "Execution");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const suggestions = MITRE_TECHNIQUES.filter((t) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      t.id.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.tactic.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const submit = async () => {
    setError(null);
    if (!title.trim() || !techniqueId.trim() || !techniqueName.trim()) {
      setError("title, technique id, and technique name are required");
      return;
    }
    setBusy(true);
    try {
      if (isEdit && props.initial) {
        await updateNode(props.chainId, props.initial.id, {
          title, description, techniqueId, techniqueName, tactic,
        });
      } else {
        await createNode(props.chainId, {
          title, description, techniqueId, techniqueName, tactic,
          after: props.parentNodeId,
          status: props.asProposal ? "proposed" : "accepted",
        });
      }
      props.onSaved();
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={props.onClose} title={isEdit ? "Edit step" : props.asProposal ? "Propose new step" : "Add step"}>
      <div className="space-y-3 text-[12px]">
        {error && (
          <div className="rounded border border-red-900 bg-red-950/30 text-red-200 px-2 py-1 text-[11px]">{error}</div>
        )}
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 focus:outline-none focus:border-amber-600" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 focus:outline-none focus:border-amber-600" />
        </Field>
        <Field label="Tactic">
          <select value={tactic} onChange={(e) => setTactic(e.target.value as Tactic)}
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 focus:outline-none focus:border-amber-600">
            {TACTICS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="MITRE technique">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <input value={techniqueId} onChange={(e) => setTechniqueId(e.target.value)} placeholder="T1234.005"
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono focus:outline-none focus:border-amber-600" />
            <input value={techniqueName} onChange={(e) => setTechniqueName(e.target.value)} placeholder="technique name"
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 focus:outline-none focus:border-amber-600" />
          </div>
        </Field>
        <Field label="Suggestions">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter common techniques…"
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 mb-1 focus:outline-none focus:border-amber-600" />
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto scroll-thin">
            {suggestions.map((s) => (
              <button key={s.id} type="button"
                onClick={() => { setTechniqueId(s.id); setTechniqueName(s.name); setTactic(s.tactic); }}
                className="text-[10px] rounded border border-zinc-800 bg-zinc-900 hover:border-amber-600 px-1.5 py-0.5">
                <span className="font-mono text-amber-300">{s.id}</span> <span className="text-zinc-300">{s.name}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="flex items-center gap-2 pt-1">
          {isEdit && props.initial && (
            <button type="button" onClick={async () => {
              if (!confirm(`Delete node "${props.initial!.title}"?`)) return;
              await deleteNode(props.chainId, props.initial!.id);
              props.onSaved(); props.onClose();
            }} className="rounded border border-red-900 bg-red-950/30 text-red-300 px-2 py-1 text-[11px]">
              delete
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={props.onClose} className="rounded border border-zinc-800 bg-zinc-900 hover:border-zinc-600 px-2 py-1">cancel</button>
            <button type="button" onClick={submit} disabled={busy}
              className="rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1 text-zinc-50">
              {busy ? "saving…" : isEdit ? "save" : props.asProposal ? "propose" : "create"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edge editor — create/delete connections
// ---------------------------------------------------------------------------

export function EdgeEditor({
  chainId,
  nodes,
  onClose,
  onSaved,
}: {
  chainId: string;
  nodes: ChainNode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [from, setFrom] = useState(nodes[0]?.id ?? "");
  const [to, setTo] = useState(nodes[1]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal onClose={onClose} title="Connect steps">
      <div className="space-y-2 text-[12px]">
        {error && <div className="rounded border border-red-900 bg-red-950/30 text-red-200 px-2 py-1">{error}</div>}
        <Field label="From">
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
            {nodes.map((n) => <option key={n.id} value={n.id}>step {n.step} — {n.title}</option>)}
          </select>
        </Field>
        <Field label="To">
          <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
            {nodes.map((n) => <option key={n.id} value={n.id}>step {n.step} — {n.title}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded border border-zinc-800 bg-zinc-900 hover:border-zinc-600 px-2 py-1">cancel</button>
          <button type="button" onClick={async () => {
            if (from === to) { setError("cannot connect node to itself"); return; }
            setBusy(true);
            try { await createEdge(chainId, from, to); onSaved(); onClose(); }
            catch (e) { setError((e as Error).message); }
            finally { setBusy(false); }
          }} disabled={busy} className="rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1 text-zinc-50">
            {busy ? "saving…" : "connect"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export async function removeEdge(chainId: string, from: string, to: string): Promise<void> {
  await deleteEdge(chainId, from, to);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl text-zinc-100",
          wide ? "w-[720px] max-w-full" : "w-[480px] max-w-full",
        )}
      >
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="ml-auto rounded px-1.5 py-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900">
            ✕
          </button>
        </div>
        <div className="p-3 max-h-[80vh] overflow-y-auto scroll-thin">{children}</div>
      </div>
    </div>
  );
}
