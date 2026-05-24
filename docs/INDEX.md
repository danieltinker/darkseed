# Docs index — reading order

All docs in this directory, in the order to read them.

## Current architecture (read in order)

### 1. `system-a-b-architecture.html` — **the canonical joint architecture**
22 sections. Open in a browser for the dark-themed render with inline SVGs.

| § | What |
|---|---|
| 0 | summary — what this is |
| 1 | resolved decisions (table of every locked DECIDE-N) |
| 2 | physical topology — Mac ↔ Pixel ↔ Kali, cable handoff |
| 3 | report lifecycle — 16-state machine with gated transitions |
| 4 | device handoff — definitive filesystem layout |
| 5 | contracts — `execution_playbook.json` v1.1 + `dynamic_results.json` v1.1 |
| 6 | joint report — the darkseed inbox markdown contract |
| 7 | darkseed schema additions (migration 005 sketch) |
| 8 | evidence kinds — discriminated union catalog |
| 9 | indicator types + KB |
| 10 | hook synth + write-back loop |
| 11 | score recompute — static + verified |
| 12 | verdict mirror A → darkseed |
| 13 | Agent A's minimal proof viewer (6 tabs) |
| 14 | Agent B sub-agents (existing 6 + new) |
| 15 | workflows table |
| 16 | HTTP fallback APIs — second data pipeline |
| 17 | timing, clocks, synchronization |
| 18 | memory + storage budget + compression |
| 19 | roadmap — 5 PoC sprints + v2 |
| 20 | verdict engine — 10-layer classifier |
| 21 | Alice — evidence store UI spec |
| 22 | open items / planning slots |

### 2. `agent-a-response-v2.md` — **v3.0 ratification + Verdict Engine + Alice**
Response to Agent B's implementation plan. Resolves all 6 B-ASKs + 6 Qs. Specifies the 10-layer Verdict Engine in depth, including worked examples (`play.googleapis.com` filtered vs `play.google.com/store/apps/details?id=...` flagged). Specifies the Alice UI. Revised sprint plan. **This is what jetski-sync v3.0 ratifies.**

### 3. `darkseed-agent-prompts.md` — **Claude-side system prompts spec**
1135 lines. Ready-to-paste system prompts for Agent B + 8 sub-agents. Antigravity owns Agent A; this doc is Claude-side only. Contains: orchestrator (`agent_b.md`), 6 existing dyn-* sub-agents updated for v1.2, 2 new (`dyn-publisher`, `dyn-verdict-engine`), 1 deferred v2 (`dyn-priors`), chain resolution logic, KB consumption matrix, error recovery, memory layout, cross-model boundary with Gemini-A.

### 4. `architecture.html` — **darkseed-internal reference**
Pre-jetski-integration architecture of the standalone darkseed (Phases 1-9). Useful for understanding what was built before the joint contract. **Superseded** for most planning purposes by `system-a-b-architecture.html`; kept as the deep reference for darkseed-internal subsystems (reports inbox, KB polarity history, TF-IDF index, content-addressed blobs).

## Active requests + responses

### 5. `agent-a-real-poc-data-request.md` — **active request**
Open request to Agent A (Gemini side) to push their real static-analysis artifacts so we can validate v1.1 contracts against ground truth BEFORE Sprint 1 starts. 8 artifact buckets + 8 judgment questions. Awaiting their `10_*.md` push to jetski-sync.

## Superseded / archived

### 6. `agent-b-implementation-prompt.md` — **superseded by Agent B's response**
The original meta-prompt sent to Agent B asking them to produce their implementation plan. Their response is at `jetski-sync/06_agent_b_implementation_plan.md`. Kept for traceability; no longer the active conversation.

## Companion repo

External: https://github.com/danielb-arch/jetski-sync

| # | File | Author |
|---|---|---|
| 01 | `01_agent_a_architecture_blueprint_v2.md` | Agent A team — source of truth blueprint |
| 02 | `02_agent_b_alignment_response.md` | Agent B — gaps + 5 refinements + 9 DECIDEs |
| 03 | `03_agent_a_sync_report.md` | Agent B — darkseed integration plan + 14 DECIDEs |
| 04 | `04_agent_b_dynamic_execution_v3.md` | Agent B — current live spec |
| 05 | `05_agent_a_implementation_request.md` | Mirror of `agent-b-implementation-prompt.md` |
| 06 | `06_agent_b_implementation_plan.md` | Agent B — response to 05 with 6 B-ASKs + 6 Qs |
| 07 | `07_agent_a_response_v2_plus_verdict_engine.md` | Mirror of `agent-a-response-v2.md` (resolves all 12 items + Verdict Engine + Alice) |
| 08 | `08_darkseed_agent_prompts.md` | Mirror of `darkseed-agent-prompts.md` |
| 09 | `09_agent_b_request_for_live_poc_data.md` | Mirror of `agent-a-real-poc-data-request.md` |
| 10 | (pending) `10_agent_a_live_poc_data.md` | **awaiting Agent A** |
| 11 | (planned) `11_a_b_real_data_fit_report.md` | response after diffing 10 against v1.1 schemas |

After 10 + 11 round-trip → cut `jetski-sync v3.1` tag → Sprint 1 begins on both sides.
