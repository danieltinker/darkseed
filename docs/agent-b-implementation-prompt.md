# Agent B — Implementation Plan Request

**From:** Agent A architecture side (darkseed × jetski joint planning)
**To:** Agent B (you — the dynamic / Frida / sandbox executor side, running Windows → SSH → Kali → Pixel 7)
**Date:** 2026-05-24
**Action requested:** read the joint architecture, then produce your implementation plan and push it as `06_agent_b_implementation_plan.md` in the `jetski-sync` repo.

---

## 0. Context — what's already aligned

The four interview rounds with the operator have resolved every DECIDE-N from the jetski-sync repo plus five new architectural decisions. The full joint architecture is now published:

- **Joint architecture (single source of truth):** https://github.com/danieltinker/darkseed/blob/main/docs/system-a-b-architecture.html
- **darkseed internals (for reference):** https://github.com/danieltinker/darkseed/blob/main/docs/architecture.html
- **darkseed code (Sprint 1-5 targets all in this repo):** https://github.com/danieltinker/darkseed

The architecture doc has 20 sections. Read at least §0-§5, §10, §16-§18 before responding. Read everything if you can.

## 1. What's been decided (you don't need to re-decide these)

Quick summary of the locked decisions that affect your code:

| ref | resolution |
|---|---|
| **Topology** | Dual-host as the blueprint v2 wrote it — macOS for A, Windows + Kali for B, real cable handoff. Your "consolidated mode" stays as a dev fallback but not the prod target. |
| **darkseed placement** | On the same Kali host as you. Local FS for the publisher's writes. |
| **Transport** | Device cable is canonical. <strong>HTTP fallback is ALSO first-class</strong> (promoted from v2). Both sides run a local API. Renderer tries local FS → falls back to HTTP → placeholder. |
| **Hook synthesis** | Full autonomy + full transparency. Synthesized hooks write back to device at `riskware_evidences/triggers/riskware_trigger_<RID>_hook_synth.js` alongside A's hook. New IOCs round-trip into A's rubric next cycle (via joint report). |
| **Frida output** | Pure NDJSON via `send()`. No more plain-text logs. Publisher pipes directly into `FridaTracePayload`. |
| **Logcat** | New evidence kind `logcat_capture` (not overloading `process_spawn`). |
| **Phases-as-nodes** | One `chain_node` per Logical Phase (`## N. Logical Phase N: <name>`), not per rubric. |
| **Score recompute** | Both numbers live: `static_score` (A, immutable) + `verified_score` (B, mutable). Joint report shows both + delta. |
| **Workflows table** | Auto-promote on first confirmed run + manual curate in darkseed. |
| **IndicatorType additions** | `library`, `class`, `method`, `shared_pref_file`, `native_symbol`. |
| **Ad-SDK list canonical source** | `darkseed/data/kb-seed/benign.json` with `category: "sdk"`. Pull fresh per run. |
| **Push-notification heuristic** | Universal hook captures `Intent.setData`; URL fires w/o preceding setData → scored. |
| **Framework limitations** | Document in `dynamic_results.notes`; don't fail. |
| **Static-Self-Sufficient flag** | Both stored: `static_self_sufficient_a` (A's call) and `_b` (your review). |
| **Decompiled source on device** | Tarball (gzipped), single sha-addressable blob. You untar to scratch. |
| **Timing** | Pure ISO-8601 + epoch_ms + Lamport seq on every JSON write. NTP on Kali. Capture Pixel clock offset at preflight. |
| **Memory + storage** | Hard cap 500 MB / job on device; compression strategy per evidence kind (see §18.3). |
| **Cleanup** | Device dir wiped after `state.A_ack`; Kali scratch purged post-publish; orphan sweep weekly. |
| **Reviewer feedback loop** | Closed-loop: labels.jsonl written, verdict mirrors A→darkseed. Agent priors deferred to v2 (you don't pull priors before runs in PoC). |

## 2. What we need YOU to plan (the implementation work on your side)

Produce `06_agent_b_implementation_plan.md` in jetski-sync with sections for:

### 2.1 Sub-agent changes
For each existing sub-agent (`dyn-device-health`, `dyn-playbook-scout`, `dyn-frida-spawn`, `dyn-vpn-control`, `dyn-evasion-analyzer`, `dyn-hook-synth`), say:
- What changes (if any)?
- Specifically: how do you adopt the new evidence schema (Lamport seq, clock offset, ndjson via `send()`, kind enums)?
- What new validation does each agent run on its outputs?

### 2.2 New sub-agent: `dyn-publisher`
- Where it lives (file path, language)
- Trigger (cron? on `state.B_complete` detection? CLI invocation by the operator?)
- Inputs (device handoff dir + your scratch)
- Outputs (joint report .md into `~/darkseed/data/reports/inbox/`, blobs into `~/darkseed/data/blobs/<sha256>`)
- The renderer it uses to build the joint markdown — spec which template engine and how it maps each evidence file to a section in §6 of the joint arch doc
- Idempotency strategy (must be safe to re-run for the same job)
- Failure modes + your handling

### 2.3 HTTP server on Kali (your side of the dual-pipeline)
- Where it runs (Flask alongside today's `:5051`? Or rolled into darkseed's Hono `:3001`? Or new dedicated port?)
- Auth model (bearer token, sourced from where, rotated how?)
- Endpoints you'll implement to serve Agent A's renderer (see §16 of joint arch — the right column lists the URLs Agent A's dashboard expects)
- Backpressure / rate-limiting strategy if A polls aggressively for live frida ndjson
- CORS posture (A's dashboard origin is `http://localhost:5180`; Kali API origin is `http://kali.local:3001`)

### 2.4 Frida hook contract
- Specifically: how the universal hook emits NDJSON via `send()`. One JSON object per event, written to stdout, your script pipes into the ndjson file.
- Event schema you commit to (the `{t, type, target, args, result}` minimum from FridaTracePayload, plus what you'll add).
- The hook synthesis side: when `dyn-hook-synth` runs, what determines the synth `script_sha256` it writes back to device? (Stable per (rubric_id, package_class_pattern, intent) tuple, or per-run uuid?)
- The "round-trip" mechanism: how does a NEW IOC captured by synth land in the joint report's "discovered by synth" section?

### 2.5 NTP + clock offset capture
- Confirm chronyd setup on Kali (or counter-propose).
- Concrete implementation of "embed Pixel clock offset into job_metadata" — show the bash/python snippet you'll run at preflight.
- How does the offset get propagated into every JSON write thereafter?

### 2.6 Storage discipline
- Where do you keep scratch? (Today: `~/pentest-lab/jobs/<job_id>/` — same?)
- Cleanup cron — when does it run, what does it delete?
- How do you enforce the 500 MB per-job device cap? Pre-check before staging, or post-pull truncate-and-warn?

### 2.7 Workflows auto-promote
- Concretely: which step in `dyn-frida-spawn` (or the publisher) creates a row in `workflows`?
- What `trigger_steps_json` shape — same as the literal playbook steps you ran, or a generalized version?

### 2.8 Things you need from A's side
- Be explicit about anything you require from Agent A (the macOS static side) before you can ship. Examples likely include:
  - `manifest_summary.json` schema acknowledgement
  - `expected_indicators` YAML in rubric MD
  - `static_score` field in `execution_playbook.json:job_metadata`
  - `tap-required: true` flag in rubric for push-notification exclusion
  - The `decompiled.tar.gz` at `static/decompiled.tar.gz` on device pre-`A_complete`

### 2.9 Things you'd push BACK to A as new asks
- New schema fields you'd want from A that weren't covered
- New JSON keys you'd want in `execution_playbook.json` v1.2

### 2.10 Test plan
- One concrete app you'll re-process end-to-end through the new pipeline (suggest: `com.behemoth.movhdnew` since it's confirmed in your 17-job history)
- Pass criteria (what counts as "the joint pipeline works"?)

## 3. Response format

Push `06_agent_b_implementation_plan.md` to https://github.com/danielb-arch/jetski-sync with:

```markdown
# Agent B — Implementation Plan (response to 05_a_b_arch_request)
**Date:** 2026-05-24
**Author:** Agent B
**Responds to:** docs/agent-b-implementation-prompt.md in darkseed repo
**Joint arch reference:** https://github.com/danieltinker/darkseed/blob/main/docs/system-a-b-architecture.html

## Acknowledgement
[short paragraph confirming you read sections 0-5, 10, 16-18 of the joint arch]

## §2.1 Sub-agent changes
[per-sub-agent edits]

## §2.2 dyn-publisher
[full spec]

## §2.3 HTTP server on Kali
[port, framework, endpoints, auth, CORS]

## §2.4 Frida hook contract
[NDJSON shape + synth lookup key]

## §2.5 NTP + clock offset
[concrete commands]

## §2.6 Storage discipline
[scratch path, cleanup cron, 500 MB enforcement]

## §2.7 Workflows auto-promote
[step + schema]

## §2.8 Asks of Agent A
[explicit list with rationale]

## §2.9 New asks (your initiative)
[anything else you want before going live]

## §2.10 Test plan
[concrete app + pass criteria]

## §3. Sprint sizing
[your read on how many days each of §2.1-2.10 takes; this calibrates Sprint 1-5 in §19 of joint arch]

## §4. Open questions
[anything in the joint arch you'd push back on or want clarified]
```

## 4. Constraints + non-goals

- **Don't redesign the dual-host topology** — that's locked. Consolidated mode is dev-fallback only.
- **Don't add new evidence kinds beyond what §8 of joint arch lists** without flagging them as "proposed addition" in your §4 open questions.
- **Don't change the on-device filesystem layout** in §4 of joint arch — it's the contract. If you need new paths, propose them as additions, not replacements.
- **Don't gate yourself on darkseed v2 features** (priors, embeddings, etc.) — those are post-PoC.
- **Don't promise more than 5 sprints** — the operator wants PoC live in ~5 sprints. If something can't fit, list it in §4 open questions for future scoping.

## 5. Timing of your response

Operator wants `06_agent_b_implementation_plan.md` in the jetski-sync repo within 24-48 hours of receiving this prompt, so the joint Sprint 1 can start with both sides synchronized.

When your plan is in, the operator will:
1. Diff it against the joint arch
2. Resolve any new DECIDEs you surface
3. Cut a v3.0 tag of the jetski-sync repo
4. Kick off Sprint 1 on both sides

---

## Appendix A — quick reference of file paths you'll touch

```
On darkseed (Kali, ~/darkseed/):
  api/src/migrations/005_a_b_integration.sql      ← new migration (already designed in §7)
  api/src/routes/{verdict,kb,reports}.ts          ← existing, may need extensions
  data/reports/inbox/                             ← your dyn-publisher writes here
  data/blobs/<sha256>                             ← your dyn-publisher stores blobs here
  data/kb-seed/benign.json                        ← ad-SDK list lives here (DECIDE-A3)

On Kali system-wide:
  ~/pentest-lab/jobs/<job_id>/                    ← your scratch (existing)
  ~/.claude/agents/dyn-publisher.md               ← new sub-agent file (you write)
  /etc/systemd/system/darkseed-api.service        ← if you decide to systemd-ize darkseed
  ~/pentest-dashboard/                            ← old Flask :5051; absorb into darkseed by Sprint 5

On device (Pixel 7):
  /data/local/tmp/riskware_handoff/<job_id>/      ← contract surface (see §4 of joint arch)

On Mac (Agent A's side, you don't touch directly):
  ~/pentest-lab/jobs/<job_id>/                    ← A's scratch
  Agent A dashboard listens at localhost:5180
```

## Appendix B — your authority

Per the operator: you have full autonomy to:
- Synthesize Frida hooks when A's are absent or insufficient
- Write back to device alongside A's hooks (transparency)
- Add new IOCs to the joint report's "discovered by synth" section
- Promote workflows automatically on first confirmed run

You do NOT have authority to:
- Modify A's rubric MD files directly on disk
- Rewrite A's `execution_playbook.json`
- Change a chain's verdict in darkseed (verdict authority lives in A's dashboard)
- Disable any of the resolved DECIDE-N decisions without operator approval

## Appendix C — the jetski-sync repo state when this prompt was written

```
jetski-sync/
├── README.md
├── 01_agent_a_architecture_blueprint_v2.md       (Agent A's source-of-truth)
├── 02_agent_b_alignment_response.md              (your earlier response)
├── 03_agent_a_sync_report.md                     (the 14-DECIDE handoff)
├── 04_agent_b_dynamic_execution_v3.md            (your current live spec)
├── hook_synthesizer.py                           (your reference impl)
└── (you add) 06_agent_b_implementation_plan.md   ← what this prompt asks for
```

Note: the file 05_* slot is where this very prompt could live in jetski-sync if mirrored there. The operator may copy it over; otherwise it lives in `darkseed/docs/agent-b-implementation-prompt.md`.

---

*End of implementation request. Operator awaits your push.*
