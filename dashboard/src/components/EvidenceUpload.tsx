import { useState, type DragEvent } from "react";
import clsx from "clsx";
import { Modal } from "./NodeEditor";
import { createEvidenceJson, uploadEvidence } from "../lib/data";

const STATIC_KINDS = [
  "hash", "permission", "manifest_excerpt", "string_artifact",
  "yara_hit", "dom_snippet", "cert", "url_target", "source_artifact",
];
const DYNAMIC_KINDS = [
  "syscall", "network_request", "sms_send", "permission_request",
  "ui_capture", "credential_capture", "file_write", "process_spawn",
  "click_chain", "frida_trace", "har_capture", "pcap_capture",
];

export function EvidenceUpload({
  nodeId,
  onClose,
  onSaved,
}: {
  nodeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"file" | "inline">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<"static" | "dynamic">("dynamic");
  const [kind, setKind] = useState("");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"accepted" | "proposed">("accepted");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) setFiles(dropped);
  };

  const submitFiles = async () => {
    setError(null);
    setBusy(true);
    setDone([]);
    try {
      for (const f of files) {
        const res = await uploadEvidence(nodeId, f, {
          category,
          kind: kind || undefined,
          label: label || f.name,
          status,
        });
        setDone((d) => [...d, `${res.kind} ← ${f.name}`]);
      }
      onSaved();
      // keep modal open so user can see "done" list, but allow closing
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitInline = async () => {
    setError(null);
    if (!kind || !label) { setError("kind + label required"); return; }
    setBusy(true);
    try {
      await createEvidenceJson(nodeId, {
        category, kind, label, value, meta: {}, status,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const kindOptions = category === "static" ? STATIC_KINDS : DYNAMIC_KINDS;

  return (
    <Modal title="Attach evidence" onClose={onClose} wide>
      <div className="space-y-3 text-[12px]">
        {error && <div className="rounded border border-red-900 bg-red-950/30 text-red-200 px-2 py-1">{error}</div>}

        <div className="flex gap-1 border-b border-zinc-800 pb-2">
          <Tab active={mode === "file"} onClick={() => setMode("file")}>upload file</Tab>
          <Tab active={mode === "inline"} onClick={() => setMode("inline")}>inline text</Tab>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value as "static" | "dynamic")}
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
              <option value="static">static</option>
              <option value="dynamic">dynamic</option>
            </select>
          </Field>
          <Field label="Kind">
            <select value={kind} onChange={(e) => setKind(e.target.value)}
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
              <option value="">{mode === "file" ? "(auto-detect from file)" : "(select kind)"}</option>
              {kindOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Label">
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder={mode === "file" ? "(uses filename if blank)" : "short human label"}
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1" />
        </Field>

        {mode === "file" ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={clsx(
                "rounded border-2 border-dashed px-4 py-8 text-center transition",
                dragging ? "border-amber-500 bg-amber-950/20 text-amber-200" : "border-zinc-700 text-zinc-500",
              )}
            >
              drop files here, or
              <label className="ml-1 underline cursor-pointer">
                <input type="file" multiple className="sr-only"
                  onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])} />
                browse
              </label>
              <div className="mt-2 text-[10px] text-zinc-600">
                auto-detects: .har → har_capture · .pcap → pcap_capture · .ndjson/frida.* → frida_trace ·
                image/* → ui_capture · code → source_artifact
              </div>
            </div>
            {files.length > 0 && (
              <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2 text-[11px] font-mono space-y-0.5">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span className="text-zinc-200 truncate">{f.name}</span>
                    <span className="text-zinc-500 text-[10px]">{(f.size / 1024).toFixed(1)} KB</span>
                    <span className="text-zinc-600 text-[10px] ml-auto">{f.type || "—"}</span>
                  </div>
                ))}
              </div>
            )}
            {done.length > 0 && (
              <div className="rounded border border-emerald-800 bg-emerald-950/30 p-2 text-[11px] font-mono space-y-0.5 text-emerald-200">
                {done.map((d, i) => <div key={i}>✓ {d}</div>)}
              </div>
            )}
          </>
        ) : (
          <Field label="Value">
            <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={6}
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px]" />
          </Field>
        )}

        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as "accepted" | "proposed")}
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
            <option value="accepted">accepted</option>
            <option value="proposed">proposed (needs review)</option>
          </select>
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded border border-zinc-800 bg-zinc-900 hover:border-zinc-600 px-2 py-1">close</button>
          {mode === "file" ? (
            <button type="button" onClick={submitFiles} disabled={busy || files.length === 0}
              className="rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1 text-zinc-50">
              {busy ? "uploading…" : `upload ${files.length}`}
            </button>
          ) : (
            <button type="button" onClick={submitInline} disabled={busy}
              className="rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1 text-zinc-50">
              {busy ? "saving…" : "save"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx("rounded px-2 py-1 text-[11px]", active ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-100")}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
