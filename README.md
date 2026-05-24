# darkseed

The **evidence-collection engine** for the darkseed × jetski malware-analysis pipeline.

darkseed is the persistent brain that consumes joint reports from Agent A (static / Gemini-Antigravity on macOS) + Agent B (dynamic / Claude-orchestrated Kali) and stores chains of attack with content-addressed evidence, indicator KB, audit trail, agent labels, and TF-IDF cross-corpus similarity. Pixel 7 is the broker carrying contracts between the two agents.

## What this repo contains

| Path | What |
|---|---|
| `api/` | Hono server (port `:3001`) — chain CRUD, evidence upload, KB, workflows, reports inbox watcher, verdict mirror, exports (STIX / JSONL / labels) |
| `dashboard/` | Vite + React + React Flow + Tailwind dashboard (port `:5173`) — list / graph / evidence pane / KB browser / reports / queue |
| `generator/` | Synthetic chain generator (1000 chains seeded from URLhaus + OpenPhish + fallback for testing) |
| `scripts/` | `dev-all.mjs` (boots api + dashboard concurrently) |
| `docs/` | **Architecture + planning docs — see `docs/INDEX.md` for the reading order** |
| `screenshots/` | Current rendered screens (older eras archived under `screenshots/archive/`) |

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│ Agent A  (Gemini + Antigravity)  on macOS                        │
│  - DARBEK scrape → score card → manual slice → run hunt          │
│  - Produces playbook + rubrics + hooks + decryptors + tarball    │
│  - Operator's daily-driver dashboard (Co-Reviewer)               │
│  - Verdict authority (mirrors to darkseed)                       │
└──────────────────────┬───────────────────────────────────────────┘
                       │  USB cable (HUMAN moves; no KVM)
┌──────────────────────▼───────────────────────────────────────────┐
│ Pixel 7 (rooted)                                                  │
│  /data/local/tmp/riskware_handoff/<job_id>/                       │
│   state sentinels A_* / B_* + JSON contracts                      │
└──────────────────────┬───────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│ Agent B  (Claude on Windows → SSH → Kali VM → USB → Pixel)       │
│  - 6 existing dyn-* sub-agents + dyn-publisher + dyn-verdict-engine│
│  - Layered Frida hooks (A's bypass + universal + synth + driver) │
│  - Multi-VPN baseline; per-phase verification_result evidence    │
│  - Pure NDJSON via send(); 10-layer verdict engine               │
└──────────────────────┬───────────────────────────────────────────┘
                       │  publisher writes joint .md
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ darkseed (Kali, this repo)                                       │
│  - Reports inbox watcher → ingester → chains                     │
│  - SQLite + content-addressed blob store + FTS5 + TF-IDF         │
│  - Verdict engine annotations + KB + workflows auto-promote      │
│  - Dashboard for full evidence drill-down                        │
└──────────────────────────────────────────────────────────────────┘
```

## Project state (2026-05-25)

**Planning:** complete through v3.0 of the joint contract (`jetski-sync` repo + `docs/`).
**Implementation:** Phases 1-8 of darkseed standalone shipped (synthetic chains generator, basic dashboard, KB, reports, verdict + feedback). Joint Sprint 1 (the cross-agent pipeline) **not yet started** — awaiting Agent A's live-PoC data push so we can validate v1.1 contracts against ground truth.

## Quick start (existing standalone darkseed)

```bash
pnpm install
pnpm generate         # generate 1000 synthetic chains
pnpm migrate          # import into SQLite
pnpm kb:seed          # seed indicator KB from templates
pnpm dev              # api on :3001 + dashboard on :5173
```

Open http://localhost:5173.

## Reading order (architecture + planning)

Open `docs/INDEX.md` for the reading order. TL;DR:

1. **`docs/system-a-b-architecture.html`** — canonical joint architecture (22 sections)
2. **`docs/agent-a-response-v2.md`** — v3.0 decisions + Verdict Engine + Alice
3. **`docs/darkseed-agent-prompts.md`** — Claude-side prompts ready to paste into `~/.claude/agents/`
4. **`docs/architecture.html`** — darkseed-internal reference (Phases 1-9 of the standalone)

## Joint contract repo

The companion repo for the agent-side conversation lives at https://github.com/danielb-arch/jetski-sync. Numbered docs (01_* through 09_*) are the synced conversation between the two agent-side teams; v3.0 tag captures the locked joint contract.

## License

Internal research; not externally publishable.
