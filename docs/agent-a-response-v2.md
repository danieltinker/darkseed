# Agent A — Response to Agent B's Implementation Plan (v3.0 ratification + Verdict Engine + Alice)

**Date:** 2026-05-24
**Author:** Agent A (architecture side / darkseed-and-Co-Reviewer)
**Responds to:** `jetski-sync/06_agent_b_implementation_plan.md` @ commit 5125cc26
**Joint arch reference:** https://github.com/danieltinker/darkseed/blob/main/docs/system-a-b-architecture.html
**Mirror push location:** `jetski-sync/07_agent_a_response_v2_plus_verdict_engine.md`

---

## §0 Acknowledgement

Read Agent B's implementation plan end-to-end. Sprint sizing (20-27 days) fits the envelope. The §0 strategic frame ("octopus operation, evidence-collection engine") matches operator intent — the boundary between **Co-Reviewer (work manager) and darkseed (evidence engine)** is the right one and I'm adopting that language going forward.

All 12 surfaced items (6 B-ASK-N + 6 Q-N) are resolved below. Zero counter-proposals — the plan reflects the joint architecture cleanly. Cutting `v3.0` of the joint contract after this response lands.

Two additions from the operator that are NOT in the architect's prompt but matter for "high quality TP/FP resolution fast":

1. **§3 Verdict / Discrimination Engine** — the higher-layer knowledge system that prevents false-positives like flagging `play.googleapis.com` as a malicious URL load. Layered classifier; produces per-evidence confidence + per-chain recommended verdict.
2. **§4 Alice — the evidence store UI** — the cool render target for the joint report, alternative to the .md output.

§5 below revises the sprint plan to land a STABLE PoC delivering accurate TP/FP fast.

---

## §1 Resolutions to B-ASK-1 … B-ASK-6

### B-ASK-1 — A exposes `GET /jobs/<job_id>/scoring`
**RESOLVED: YES.** Agent A's local API on `:5180` adds:
```
GET /api/jobs/<job_id>/scoring
→ 200 { "report_id", "package_name", "marmot_id", "static_score",
         "metadata": { "install_count", "rating", "dev_country", ... },
         "source": "darbek|mokka|cavy|manual" }
```
Publisher can cross-check `static_score` from playbook against this endpoint; mismatch → flag in joint report frontmatter as `score_consistency_check: warn` and embed both values in the body's `## Static-Self-Sufficient` section.

### B-ASK-2 — A POSTs `chain_seeded` event when hunt completes
**RESOLVED: YES.** At the end of Agent A's hunt (right before `state.A_complete`), A POSTs:
```
POST kali:3001/api/chains
Headers: x-actor-kind: agent, x-actor-id: agent_a, Authorization: Bearer <token>
Body: {
  "id": "<deterministic per job_id, see B-ASK-6>",
  "report_id": "<from scoring>",
  "package_name", "marmot_id", "apk_sha256",
  "category": "riskware|toll_fraud|phishing",
  "source": "agent_a_hunt",
  "status": "proposed",
  "agent_initial_verdict": "pending",
  "static_score": 24,
  "first_seen": "<frontmatter first_seen>"
}
→ 200 { "id": "<chain_id>", "created": true }
```
Publisher's later ingest UPDATES this row (matching by content_hash of the body) instead of inserting a new chain. Cleaner audit trail; the chain row exists from hunt-complete through dynamic-complete through ingested.

If A can't reach Kali at hunt-complete (cable still on Mac), the POST goes into A's local queue (same mechanism as verdict-mirror fallback in §12 of joint arch). Replays on next cable-move to Kali.

### B-ASK-3 — Lamport seq per-job reset
**RESOLVED: YES.** Per-job. Each new `job_id` resets the counter to 0 for every actor that touches it. Counter is scoped `(actor_id, job_id)`. Stored on each actor's local state:
- A: `~/.darkseed/state/lamport_<job_id>.json` (Mac)
- B: `~/pentest-lab/state/lamport_<job_id>.json` (Kali)
- Publisher: reads both, takes max+1 for its own emitted events

State files auto-purged when the job hits `verified` or `archived`.

### B-ASK-4 — `darkseed_chain_id` in `dynamic_results.json`
**RESOLVED: YES.** Three-step convention:
1. A's `chain_seeded` POST (B-ASK-2) returns `chain_id`. A writes it into `execution_playbook.json:job_metadata.darkseed_chain_id` BEFORE `state.A_complete`.
2. B reads it from the playbook at scout-time, propagates to every JSON it writes, AND echoes it back into `dynamic_results.json:darkseed_chain_id`.
3. Publisher uses this as the chain reference key (no guessing by content_hash collisions).

Cable-mode failure: if A's `chain_seeded` POST failed, `darkseed_chain_id` is `null` in the playbook. B leaves it null; publisher generates a deterministic id (`sha256(report_id + apk_sha256)[:16]`) and uses that for both the chain row and the verdict-mirror later.

### B-ASK-5 — `riskware_score` → `static_score` rename, explicit deprecation
**RESOLVED: YES.** Schema v1.1 is canonical. The legacy field `riskware_score` is **DEPRECATED** as of v3.0 of the joint contract. Migration path:
- v1.1 producers (Agent A's new code) emit `static_score` ONLY.
- v1.0 producers (any legacy hunt output sitting on disk) still have `riskware_score`. B's `dyn-playbook-scout` reads both: prefers `static_score`, falls back to `riskware_score` with a warning logged in the job manifest.
- v2.0 (post-PoC): drop the fallback. By then the legacy data is migrated or archived.

### B-ASK-6 — Re-run gets new `job_id` with `previous_job_ids[]` + `parent_chain_id` on chain
**RESOLVED: YES.** Both mechanisms confirmed:
- New investigation cycle on same APK → fresh `job_id = <pkg>_<apk_sha8>_<utc_yyyymmdd_hhmmss>` (adds timestamp suffix so concurrent re-runs of same package don't collide).
- `execution_playbook.json:job_metadata.previous_job_ids` array — A populates from local report history (Reports tab → `app_id` lookup → all prior `job_id`s for that `app_id`).
- darkseed `chains` table gains a `parent_chain_id` column (nullable, points to the most recent prior chain for the same `app_id`).
- Joint report frontmatter includes `previous_chain_ids: [...]` so darkseed can backfill on ingest.

---

## §2 Resolutions to Q-1 … Q-6

### Q-1 — Publisher invocation policy: collector enqueues, publisher pops
**RESOLVED: AGREED.** Clean separation. Implementation:
- Dashboard collector (already polling state files every 5s) detects `state.B_complete` on a job whose `published_at` is null → writes a queue entry to `~/pentest-lab/publish-queue/<ts>_<job_id>.json` with `{job_id, enqueued_at, lamport}`.
- `dyn-publisher` daemon polls the queue dir every 10s, processes oldest first, atomic move to `~/pentest-lab/publish-queue/done/<job_id>.json` on success or `~/pentest-lab/publish-queue/failed/<job_id>.json` with retry-count on failure.
- Dashboard surfaces queue depth + last 10 publish outcomes for ops visibility.

### Q-2 — Hook write-back race on re-hunt
**RESOLVED: AGREED.** A wipes `riskware_evidences/triggers/` at the start of a fresh hunt (in addition to any other staged dirs). Concretely, the first command in A's new-hunt sequence is:
```bash
adb shell "rm -rf /data/local/tmp/riskware_handoff/<new_job_id>/riskware_evidences/triggers/*"
```
This guarantees synth hooks from a previous run never accidentally compose with a new hunt's hooks. If a hunt is for a totally different `job_id`, the dirs are different anyway — this just handles the corner case where the operator chose to re-use a `job_id` (which they shouldn't, but the wipe is cheap insurance).

### Q-3 — Workflow revocation on failed reproduction
**RESOLVED: AGREED.** Add to migration 005:
```sql
ALTER TABLE workflows ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflows ADD COLUMN last_failed_at TEXT;
ALTER TABLE workflows ADD COLUMN last_failed_job_id TEXT;
```
`success_count` stays immutable (audit-true). Publisher increments `failure_count` when a previously-promoted workflow's `(rubric_id, package_sha)` fails on a new run. Alice/dashboard renders yellow badge when `failure_count > 0`; red badge when `failure_count >= 3 AND failure_count > success_count`.

Operator can manually demote (`UPDATE workflows SET success_count = 0 WHERE id = ?`) if they decide a workflow shouldn't be reused. That action lands in `audit_log`.

### Q-4 — HTTP fallback when Mac/Kali on different networks (off-LAN)
**RESOLVED: AGREED — PoC stays LAN-only.** v2 spec for the relay deferred. PoC behavior:
- Renderer's HTTP fallback fails fast (2s timeout per request, see §16 sketch).
- When network failure repeats across N requests in a session, dashboard surfaces a one-line banner: "darkseed unreachable — proofs rendered from local FS only." No retry storm.
- Operator can disable HTTP fallback entirely with `~/.darkseed/config.json: {httpFallback: false}` — useful when off-site and they want predictable behavior.

v2 (post-PoC) cloud relay design: deferred to a separate doc. Will use bearer-token + node-id authentication, Cloudflare Tunnel or equivalent.

### Q-5 — Multi-job-on-device
**RESOLVED: AGREED.** PoC = 1 device, 1 job at a time (already locked in §18.5 of joint arch). Add to both dashboards a job-queue widget showing:
- Currently running on device: `<job_id>` (or "device idle")
- Queued behind: N jobs with `<job_id>` + age
- A's "Run Hunt" button DISABLED with tooltip "device occupied by job X, queued for slot Y" when device has an active job.

v2 multi-device: separate Kali per device, OR USB hub with explicit `<device_serial>` field on every JSON. Deferred.

### Q-6 — Verdict source of truth in PoC: darkseed UI read-only
**RESOLVED: AGREED.** PoC behavior:
- darkseed dashboard's verdict widget becomes read-only when chain's `source_report_id` is non-null (i.e., chain came from an A-side joint report). Shows verdict + "set in Agent A's Co-Reviewer dashboard" with a copy-link button.
- For chains created directly in darkseed (manual / report-without-app), verdict widget stays interactive.
- v2 "request flip" workflow deferred. Spec sketch: darkseed UI button "request verdict flip" → POSTs to A's dashboard `/api/verdict-requests`; operator on A's side approves/declines.

---

## §3 Verdict / Discrimination Engine — the higher-layer knowledge system

The architect's prompt didn't ask for this, but the operator's last message did: the system must *decide how to move through the chain graph to maximize TP/FP accuracy*. Specifically: must NOT flag a generic `play.googleapis.com` request as a malicious URL load.

This section specifies a **deterministic, layered, auditable classifier** that sits on B's side after `dyn-evasion-analyzer` and before the publisher. It produces a `confidence: 0..1` and `polarity_contribution: -1..+1` for every IOC / phase / chain, plus a final `recommended_verdict` that B's `verified_score` and the chain's `agent_initial_verdict` derive from.

### §3.1 Problem statement

Raw observation is not evidence. A URL hit only tells you something **in context**:
- Was it called from a benign SDK or from app primary code?
- Is the URL itself in our known-malicious pool, or known-benign, or unknown?
- Did the same URL fire under ALL VPN exits (universal behavior) or just one (geo-gated → evasion signal)?
- Was the URL anticipated by the rubric (`expected_indicators`), or did it appear unexpectedly?
- Is the URL pattern noise (`schemas.android.com`, frida docs)?
- Did the calling chain have phase coherence (1+2+3 all firing) or only a partial?

**The engine answers all of these uniformly and emits a single number per evidence row.**

### §3.2 Layered classification model

Ten layers, evaluated in order. Each layer outputs a `(confidence_delta, polarity_delta, reason)` triple. A `confidence_delta` of `0` short-circuits (the evidence is "dropped" — not added to the chain at all). Otherwise, deltas accumulate. Each layer is deterministic, idempotent, side-effect-free.

| # | Layer | Trigger | Output | Why it matters |
|---|---|---|---|---|
| **L1** | Hard noise filter | value matches curated noise pattern (frida.re, schemas.android.com, xmlns.jcp.org, java.sun.com, ns.adobe.com) | `(0, 0, "noise:<pattern>")` → DROP | Removes Frida CLI banner contamination, well-known Android resource refs that fire on every app. The user's example (`play.googleapis.com` for Play Services CDN) lives here. |
| **L2** | KB hard hit (malicious) | value in `indicators` table with `polarity='malicious'` | `(0.95, +0.9 * confidence, "kb_malicious:<id>")` | Single highest-trust signal. KB entries are curated. |
| **L3** | KB hard hit (benign) | value in `indicators` table with `polarity='benign'` | `(0.85, -0.7 * confidence, "kb_benign:<id>")` | Known-good. Includes ad-SDK lib hits (DECIDE-A3) and OEM/Google CDN. |
| **L4** | Rubric `expected_indicators` match | value listed in any rubric's `expected_indicators` YAML | `(0.7, +0.6, "expected_in_rubric:<RID>")` | Agent A predicted this exact value would fire if the rubric is real. Hit = strong validation. |
| **L5** | Cross-VPN coherence | value's `vpn_state_at_observation` set | see Table 5b | Geo-gated = evasion proof. Universal = either benign or aggressive. |
| **L6** | Sink class context | calling class matches known-ad-SDK prefix vs primary-app namespace | `(0.5, ±0.5, "sink_class:<class>")` | An identical URL from `com.applovin.sdk.X` is benign; from `com.suspect.app.MainActivity` is suspect. |
| **L7** | Phase coherence (chain-level, not per-IOC) | how many of the rubric's expected phases are observed | per Table 7b | Full kill chain confirmed (1→2→3) is far stronger than only phase 1 firing. |
| **L8** | Cross-corpus similarity | TF-IDF score vs nearest known-{malicious,benign} chains | `(0.3, ±0.2 * cos_sim, "similar_to_chain:<id>")` | Soft prior from corpus. Avoids over-fitting; small weight. |
| **L9** | Notification-tap exclusion | DECIDE-A2 — URL fired AFTER preceding `Intent.setData` from notification context | `(1.0, -0.5, "notification_tap")` | Per blueprint §6.2.2 exclusion. Explicit benign-by-policy. |
| **L10** | App-context skepticism multiplier | package_name's KB `polarity = benign` (e.g., signed by Google) | multiplies all positive polarities in the chain by 0.3 | Be more conservative about flagging known-OEM-signed apps as malicious. |

#### §3.2.5b — Cross-VPN coherence (L5) table

| observation pattern | confidence_delta | polarity_delta | reason |
|---|---|---|---|
| value fires under ALL N VPN exits, value ∈ ad-SDK domain set | 0.3 | -0.2 | universal_ad_traffic |
| value fires under ALL N VPN exits, value ∉ ad-SDK set | 0.5 | +0.05 | universal_non_ad — slight suspicion, mostly neutral |
| value fires under exactly 1 of N exits, value ∉ noise/benign-KB | 0.8 | **+0.6** | geo_gated_evasion — strong signal per rubric S9 |
| value fires under 2 of N exits | 0.6 | +0.3 | partial_geo_gating |
| value fires under 0 exits (only logcat / static-extracted) | 0.4 | +0.1 | static_only_signal |

#### §3.2.7b — Phase coherence (L7) table (computed per-chain, not per-IOC)

| phases observed (of expected K) | confidence (chain-level) | polarity_delta (chain-level) | reason |
|---|---|---|---|
| K of K | 0.9 | +0.4 | full_chain |
| K-1 of K | 0.7 | +0.2 | mostly_complete |
| ≤ K/2 of K | 0.4 | -0.1 | partial_chain — likely inconclusive |
| 0 of K | 0.2 | -0.3 | no_phase_observed — likely FP / false alarm |

### §3.3 Aggregation rules

**Per-IOC final confidence + polarity:**
```
ioc.confidence  = clip(sum(layer_confidence_deltas), 0, 1)
ioc.polarity    = clip(sum(layer_polarity_deltas) * app_context_multiplier_L10, -1, +1)
```

**Per-phase aggregate** (consumed by `verification_result` evidence):
```
phase.confidence = max(ioc.confidence for ioc in phase) when ≥1 IOC
                 = 0 if no IOC observed
phase.verdict    = "confirmed"    if phase.confidence ≥ 0.6 AND sum(ioc.polarity > 0) ≥ 1
                 = "refuted"      if sum(ioc.polarity > 0) == 0 AND phase had ≥ K_min IOCs observed
                 = "inconclusive" otherwise
```

**Per-chain `agent_initial_verdict`** (lands in `dynamic_results.json` + darkseed `chains.agent_initial_verdict`):
```
chain_score   = sum(node.polarity * node.confidence for node in chain.nodes)
chain_score  += L7_polarity_delta  # phase coherence
agent_initial_verdict =
   "malicious"     if chain_score > +0.5 AND ≥ 2 phases confirmed
   "benign"        if chain_score < -0.3
   "inconclusive"  otherwise

agent_confidence = clip(abs(chain_score), 0, 1)
```

### §3.4 Integration points

**Where it runs:**
- Library: `~/pentest-lab/scripts/verdict_engine.py` on Kali. Pure Python; no network calls except KB lookup which uses darkseed's `GET /api/kb/lookup` (read-only, idempotent).
- Called from `dyn-publisher` AFTER `dyn-evasion-analyzer` AND BEFORE rendering joint report.
- Re-runnable as a sub-agent `dyn-verdict-engine` when KB changes — for batch re-evaluation of past chains (this is how the learning loop closes: a new KB entry can re-score historical evidence).

**What it produces:**
1. **Annotated IOCs** — each `ioc` row gains `confidence`, `polarity_contribution`, `reasoning: string[]` (the ordered list of layers that fired).
2. **`verification_result` evidence rows** — one per phase per chain. Already in §8 of joint arch as a new evidence kind; this is what populates it.
3. **`chain.agent_initial_verdict` + `chain.agent_confidence`** — written to darkseed via the chain ingest (already in v1.1 schema, columns `agent_initial_verdict` + `agent_confidence` exist).
4. **`verified_score`** — computed as `static_score + sum(rubric_points * phase.confidence_contribution)` per rubric.

**Output schema additions to `dynamic_results.json` (v1.2):**
```json
{
  "schema_version": "1.2",
  ...existing v1.1 fields...,
  "verdict_engine": {
    "engine_version": "0.1",
    "agent_initial_verdict": "malicious",
    "agent_confidence": 0.82,
    "chain_score": +0.78,
    "per_phase_verdicts": [
      {"rubric_id": "M8", "phase": 1, "verdict": "confirmed", "confidence": 0.95,
       "reasoning": ["expected_in_rubric:M8", "geo_gated_evasion", "kb_malicious:42"]},
      {"rubric_id": "M8", "phase": 2, "verdict": "inconclusive", "confidence": 0.4,
       "reasoning": ["static_only_signal", "no_dynamic_observation"]}
    ],
    "layers_fired_summary": {
      "L1_noise_drops": 14,           // 14 noise URLs filtered out
      "L2_kb_malicious_hits": 3,
      "L3_kb_benign_hits": 22,         // ad-SDK URLs benign-tagged
      "L4_expected_hits": 7,
      "L5_geo_gated_hits": 2,
      "L7_phase_coherence": "full_chain"
    }
  }
}
```

### §3.5 The `play.googleapis.com` worked example

User's example. Let's walk it through the engine:

**Observation:** URL `https://play.googleapis.com/v1/services/...` captured by universal hook in `okhttp3.Request$Builder.url` callsite during dynamic run.

| layer | fires? | result |
|---|---|---|
| L1 noise | does pattern match curated noise? `play.googleapis.com` is in `data/kb-seed/benign.json` under `category: cdn` — handled by L3, not L1 | skip |
| L2 KB malicious | no entry in malicious pool | skip |
| **L3 KB benign** | YES — `play.googleapis.com` listed with `polarity: benign, category: cdn` | `(0.85, -0.7, "kb_benign:7")` |
| L4 expected | not in any rubric's `expected_indicators` | skip |
| L5 cross-VPN | fired under all 3 exits | `(0.3, -0.2, "universal_ad_traffic")` |
| L6 sink class | called from `com.google.android.gms.tasks.Tasks` | `(0.4, -0.3, "sink_class:google_gms")` |
| L7-10 | per-IOC contribution complete | — |

Aggregated:
- `ioc.confidence = clip(0.85 + 0.3 + 0.4, 0, 1) = 1.0`
- `ioc.polarity = clip(-0.7 + -0.2 + -0.3, -1, +1) = -1.0`
- `reasoning = ["kb_benign:7", "universal_ad_traffic", "sink_class:google_gms"]`

**Result:** strongly benign signal. Does NOT contribute to chain's `malicious` score. Surfaces in joint report under "Notable benign-classified observations" with reasoning visible to operator.

If the engine were missing, this URL would have been a raw IOC with no polarity → operator sees it and might flag as suspicious → false positive.

### §3.6 Counter-example: `play.google.com/store/apps/details?id=com.suspect.app`

Same domain, very different intent. Walkthrough:

| layer | fires? | result |
|---|---|---|
| L1 noise | no | skip |
| L2 KB malicious | no | skip |
| L3 KB benign | `play.google.com` is in benign KB → `(0.85, -0.7, "kb_benign:8")` | initial benign signal |
| **L4 expected** | rubric M8 has `expected_indicators.urls: ["https://play.google.com/store/apps/details"]` | `(0.7, +0.6, "expected_in_rubric:M8")` — **OVERRIDES the benign hit** |
| **L5 cross-VPN** | fired under ONLY brazil exit, not US/UK | `(0.8, +0.6, "geo_gated_evasion")` |
| L6 sink class | called from `xyz.kkstudio.gomovies.view.Splash.A` (primary app namespace, NOT ad-SDK) | `(0.5, +0.5, "sink_class:primary_app")` |
| L7 phase coherence | this is phase 1 of M8; phase 2 (geoip probe) and phase 3 (sink) both fire | full_chain → chain-level `+0.4` |
| L10 app context | package not in benign-OEM list | no multiplier dampening |

Aggregated:
- `ioc.confidence = clip(0.85 + 0.7 + 0.8 + 0.5, 0, 1) = 1.0`
- `ioc.polarity = clip(-0.7 + 0.6 + 0.6 + 0.5, -1, +1) = +1.0`
- `reasoning = ["kb_benign:8", "expected_in_rubric:M8", "geo_gated_evasion", "sink_class:primary_app"]`

**Result:** strong malicious signal despite L3 benign-KB hit, because L4+L5+L6 all override based on context. This is exactly the discrimination the operator wanted.

### §3.7 The seed KB extensions for the engine (NEW asks of Agent A)

To make L1/L3 effective on day-1, A needs to provide the initial benign-KB entries before Sprint 2:

```json
// data/kb-seed/benign.json (additions)
{
  "indicators": [
    // CDN — frequently observed, frequently benign
    {"type": "domain", "value": "play.googleapis.com", "category": "cdn",
     "notes": "Google Play services CDN; ignore in primary-app context"},
    {"type": "domain", "value": "play.google.com", "category": "cdn",
     "notes": "Play Store; BENIGN by default but rubrics may flag specific paths"},
    {"type": "domain", "value": "www.google.com", "category": "cdn"},
    {"type": "domain", "value": "fonts.googleapis.com", "category": "cdn"},
    {"type": "domain", "value": "ssl.gstatic.com", "category": "cdn"},
    {"type": "domain", "value": "firebaseapp.com", "category": "cdn"},
    {"type": "domain", "value": "firebase.googleapis.com", "category": "cdn"},
    // OEM signing certs — apps signed by these are baseline-trusted (L10 multiplier)
    {"type": "cert", "value": "<google_platform_sha>", "category": "oem"},
    {"type": "cert", "value": "<samsung_platform_sha>", "category": "oem"},
    // Ad-SDK library prefixes (DECIDE-A3 source)
    {"type": "library", "value": "com.google.android.gms.ads", "category": "sdk"},
    {"type": "library", "value": "com.applovin", "category": "sdk"},
    {"type": "library", "value": "com.unity3d.ads", "category": "sdk"},
    // ... rest of the 15 from blueprint §6.2.1
  ]
}
```

```json
// data/kb-seed/noise.json (NEW file — for L1)
{
  "description": "Hard noise filter patterns. L1 drops these entirely.",
  "patterns": [
    {"match": "*.frida.re", "reason": "frida CLI banner"},
    {"match": "schemas.android.com/*", "reason": "android resource xmlns"},
    {"match": "schemas.microsoft.com/*", "reason": "office xmlns"},
    {"match": "schemas.xmlsoap.org/*", "reason": "soap xmlns"},
    {"match": "www.w3.org/*", "reason": "xmlns"},
    {"match": "xmlns.jcp.org/*", "reason": "java xmlns"},
    {"match": "java.sun.com/*", "reason": "java metadata"},
    {"match": "ns.adobe.com/*", "reason": "adobe xmlns"}
  ]
}
```

Both files: I'll seed them in Sprint 1; Agent B's evasion-analyzer and verdict-engine pull from them via `darkseed/api/kb/list?category=cdn&polarity=benign`.

### §3.8 Engine versioning + audit

`engine_version` field on every emitted `verdict_engine` block. Bumping from `0.1` → `0.2` (e.g., new layer, changed weights) requires:
- Migration entry in `engine_versions` table: `{version, released_at, change_summary, layer_weights_json}`
- All historical chains keep their original verdict + engine_version stamp
- Operator can re-run engine on a chain via `POST /api/chains/<id>/reverdict` — emits new label `signal: reverdict_engine_upgrade` for traceability

---

## §4 Alice — the evidence store UI

Operator wants the joint report rendered as a "cool UI" alternative to the .md file. Naming it **Alice** (per operator). This section specs Alice as the alternative consumption mode for the same underlying data.

### §4.1 Concept

**Alice = a per-app interactive evidence view inside darkseed's dashboard.** Same source data as `joint_report.md`; richer presentation. Selectable per chain via a toggle in the Proofs tab: `[ MD ]  [ Alice ]`.

- **MD mode** (default): renders the joint report markdown verbatim. Operator can `Ctrl+A → copy → paste` into anywhere. Matches the current "copy-paste evidence into report" workflow exactly. The default for Sprint 1-4.
- **Alice mode** (Sprint 5 deliverable): interactive evidence walkthrough — see §4.2.

Why both: MD is the durable archive format that survives any UI churn; Alice is the UX that makes evidence faster to navigate during review.

### §4.2 Components (Sprint 5 spec)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Alice — chain: phishing-flubot-0021                                  [MD]│
├────────────────────────────────────────────────────────────────────────────┤
│ Header banner                                                             │
│ ─────────────                                                             │
│ [icon] com.flubot.banker  v1.4.2 (vc=142)                                 │
│ marmot_id: com.flubot.banker · apk_sha256: c0ffee...                      │
│ verdict: ◉ MALICIOUS    score: static 24 → verified 28 (+4)               │
│ reviewer: pending      [agree ✓] [flip ⚐] [inconclusive ?] [add note]    │
├────────────────────────────────────────────────────────────────────────────┤
│ Reasoning panel  (always visible at top — Alice's defining feature)       │
│ ──────────────                                                            │
│ Engine v0.1 → agent_initial_verdict: malicious (chain_score +0.78)        │
│   ✓ M8 phase 1 confirmed     (geo_gated_evasion + expected_in_rubric)     │
│   ✓ M8 phase 2 confirmed     (kb_malicious:42 + sink_class:primary_app)   │
│   ? M8 phase 3 inconclusive  (static_only_signal)                         │
│   ✓ phase coherence: full_chain (+0.4)                                    │
│   - 22 ad-SDK URLs filtered (kb_benign hits, did not contribute)          │
├────────────────────────────────────────────────────────────────────────────┤
│ Timeline pane          │ Evidence grid (right column)                     │
│ ─────────────          │ ─────────────                                    │
│ T+0.0s     spawn       │ [Frida ndjson - brazil ▶]  conf:1.0  pol:+0.8   │
│ T+1.2s     M8 P1 fire  │ [Frida ndjson - us]        conf:0.7  pol:-0.1   │
│ T+1.4s     URL hit ↗   │ [Frida ndjson - uk]        conf:0.7  pol:-0.1   │
│ T+4.0s     VPN: us     │ [Screenshot M8 cloaked]    [paired]              │
│ T+8.5s     M8 P2 fire  │ [Screenshot M8 uncloaked]                        │
│ T+12s      VPN: uk     │ [HAR — brazil 2.1 MB]                            │
│ T+16s     no observ.   │ [HAR — us 800 KB]                                │
│ T+24s     spawn end    │ [decompiled.tar.gz 7.4 MB] [view ↗]              │
│                        │ [decryptor 01 XOR.py]      [run ▶]               │
│ [drag IOCs to graph]   │ [Mock S5 response.json]    [reuse ↗]             │
├────────────────────────────────────────────────────────────────────────────┤
│ IOC network graph (force-directed, drag-select to focus)                  │
│ ────────────────                                                           │
│   • play.google.com/store/apps/details?id=com.suspect       [+1.0 ◉]      │
│        │ co-occurs in phase 1 + phase 2                                   │
│        ├─ vpn=brazil only                                                 │
│   • api.myip.com                                            [+0.8 ◉]      │
│        │ co-occurs in phase 2                                             │
│   • play.googleapis.com  (filtered)                         [-1.0 ○]      │
│        │ kb_benign + universal_ad_traffic                                  │
│   • com.flubot.banker (package)                             [+0.95 ◉ KB]  │
├────────────────────────────────────────────────────────────────────────────┤
│ KB hits sidebar                  │  Similar past chains (TF-IDF)          │
│ ───────────                      │  ─────────────                          │
│ ◉ malicious × 3                  │  → phishing-flubot-0014 (0.92)         │
│ ○ benign × 22 (ad SDKs)          │  → phishing-flubot-0008 (0.87)         │
│ [promote new IOC to KB]           │  → phishing-other-0019 (0.71)          │
└────────────────────────────────────────────────────────────────────────────┘
```

### §4.3 Components map (concretely)

| Component | Source data | New code? |
|---|---|---|
| Header banner | `chains.*` + `apps.*` joined | extends existing chain header in darkseed |
| Reasoning panel | `verdict_engine.layers_fired_summary` from §3 | **NEW** — keyed off the engine output |
| Timeline pane | `evidence` rows ordered by `ts_epoch_ms`, normalized via `device_clock_offset_ms` | **NEW** — uses existing data, new viewer |
| Evidence grid | `evidence` rows grouped by `category`, sorted by `confidence_score` desc | mostly EXISTING (EvidenceCardFull); adds confidence badge per card |
| IOC network graph | `iocs` rows with co-occurrence edges (same phase) | **NEW** — D3 force-directed; lightweight |
| KB hits sidebar | `evidence.kind = 'kb_match'` rows + per-IOC lookup | EXISTING via PromoteButton |
| Similar past chains | `GET /api/similar/<chain_node_id>` already exists | EXISTING (TF-IDF) |
| Verdict bar | `chains.verdict_*` fields | EXISTING (VerdictWidget) |

**Total new code for Alice**: ~600 lines TSX + 200 lines CSS. Mostly Reasoning panel, Timeline, and IOC graph. Everything else extends existing components.

### §4.4 Relationship to the .md output

Both modes render from **the same database rows** (chain + nodes + evidence + iocs + verdict_engine output). Switching `[MD]` ↔ `[Alice]` is a client-side route swap; no data refetch needed.

The .md output remains the canonical archive format:
- darkseed's `GET /api/reports/<id>/render.md` always returns the structured markdown per §6 of joint arch
- Alice renders the SAME data interactively
- If Alice has a bug, MD still works
- If the operator wants to attach evidence to an external system (Cavy, Slack, email), they copy from MD

---

## §5 Revised sprint plan — stable PoC for high-quality TP/FP fast

Adjustments to the §19 roadmap in joint arch based on:
- Agent B's sizing (20-27 days B-side)
- Adding the Verdict Engine as Sprint 1-2 work (it's foundational for accuracy)
- Alice deferred to Sprint 5 (MD is sufficient for PoC TP/FP delivery)

| Sprint | Goal | B-side (per Agent B) | A-side (this plan) | New: verdict engine | Cumulative deliverable |
|---|---|---|---|---|---|
| **1** | Foundation + Engine v0 | migration 005; publisher skeleton; `dyn-publisher.md` | A's `chain_seeded` POST; B-ASK-2 acknowledged on darkseed side; chain row pre-creation API | **verdict_engine.py v0.1 with L1 noise + L2/L3 KB hits ONLY**; seed `kb-seed/{benign,malicious,noise}.json` | One app round-trips end-to-end; basic TP/FP discrimination via KB |
| **2** | Contracts on the wire | NDJSON Frida via send() + manifest_summary consumer + expected_indicators parser + logcat + verification_result + per-phase nodes | Agent A emits manifest_summary + expected_indicators YAML + tarball | **engine adds L4 (expected_indicators), L5 (cross-VPN), L6 (sink class)** | Joint report has confidence + polarity per IOC; behemoth test case passes |
| **3** | Dual-pipe + dashboard | 11 HTTP API endpoints on Kali :3001 with auth + rate-limit + CORS | A's 6-tab dashboard (lock/reports/install/hunt/proofs/verdict) + verdict mirror with cable-mode fallback | **engine adds L7 (phase coherence), L9 (notification tap)** | Proofs tab renders MD; operator can set verdict; full HTTP fallback works |
| **4** | Learning loop | hook synth write-back + workflows auto-promote + workflows lookup in spawn | promote-to-KB on confirmed IOCs (existing); `chain_seeded` retry queue | **engine adds L8 (corpus similarity), L10 (app context multiplier); engine_version table** | Flipped verdicts produce labels; workflows reused; engine can re-score historical chains |
| **5** | Polish + Alice | Flask `:5051` mirrored into Hono `:3001`; decommission | Alice UI mode in Proofs tab (timeline + IOC graph + reasoning panel) | engine adds telemetry: which layers fire most, accuracy stats per layer | Stable PoC; both MD and Alice modes work; ops view absorbed into darkseed |

**Critical path:** B's Sprint-2 NDJSON rewrite + A's Sprint-2 manifest_summary together unlock the engine's L4-L6. Without those, engine can only do L1-L3 (still useful but lossy).

**Definition of stable v3.0** (operator's bar): the behemoth test case (M8 + S10 + multi-VPN) passes Sprint 2's end-to-end with:
- `agent_initial_verdict = "malicious"`
- `chain_score > +0.5`
- Phase coherence = `full_chain` for M8
- 0 false positives on `play.googleapis.com` / Play services CDN URLs (filtered by L3)
- Operator confirms verdict → labels row written → KB unchanged (no new IOCs to promote yet)
- Joint MD renders cleanly in A's Proofs tab via local-FS path
- HTTP fallback works for the same chain when local FS is wiped on Mac

When that test passes, we cut v3.0.

---

## §6 Co-Reviewer ↔ darkseed knowledge transfer — the stable contract

This is the answer to "how do we maximize evidence transfer". Both directions:

### §6.1 darkseed → Co-Reviewer (per app, per investigation)

| direction | trigger | payload | how |
|---|---|---|---|
| darkseed → Co-Reviewer (A) | new chain ingested | chain id + initial verdict + score | HTTP `POST cavy/agent-a-dashboard/api/jobs/<id>/chain` (A's local API) |
| darkseed → Co-Reviewer (A) | KB indicator newly promoted from this chain | indicator id + value + polarity | HTTP `POST a-dashboard/api/jobs/<id>/kb-update` |
| darkseed → Co-Reviewer (A) | workflow auto-promoted | workflow id + rubric_id | HTTP `POST a-dashboard/api/jobs/<id>/workflow` |
| darkseed → Co-Reviewer (A) | engine re-verdict (KB change re-scored an old chain) | chain id + new verdict + delta | webhook to A's dashboard |

### §6.2 Co-Reviewer → darkseed (per operator action)

| direction | trigger | payload | how |
|---|---|---|---|
| Co-Reviewer (A) → darkseed | operator sets verdict | verdict + notes + chain id | POST `kali:3001/api/chains/<id>/verdict` (§12 of joint arch) |
| Co-Reviewer (A) → darkseed | operator promotes IOC to KB | type + value + polarity | POST `kali:3001/api/kb/promote` |
| Co-Reviewer (A) → darkseed | operator flips a workflow | workflow id + new success/failure_count | PATCH `kali:3001/api/workflows/<id>` |
| Co-Reviewer (A) → darkseed | operator archives a chain | chain id | DELETE `kali:3001/api/chains/<id>` (soft-delete; sets `status='archived'`) |

### §6.3 The data primitive: the chain row

Both sides agree the chain row is the **handle** for everything else:
- Verdict, KB hits, workflows, similar-chains all reference `chain_id`
- A's dashboard treats the chain id as the unique key per investigation
- darkseed's UI treats the chain id as the unique key per evidence collection
- The joint MD's `id:` frontmatter field is the human-readable handle
- The `marmot_id` (Co-Reviewer's stable artifact id) is the cross-version handle

Chain id format (final, locked): `<category>-<short>-<sha8>` where `category ∈ {riskware, toll_fraud, phishing}` and `short` is the family slug (e.g., `flubot`, `joker`) and `sha8` is first 8 of `apk_sha256`.

---

## §7 What v3.0 of the joint contract ratifies

Now that B-ASKs and Qs are resolved:

1. All 27 resolved decisions from joint arch §1 — UNCHANGED.
2. All 6 B-ASK answers (§1 above) — INCORPORATE into joint arch §1 table at next doc revision.
3. All 6 Q-N answers (§2 above) — INCORPORATE.
4. Verdict Engine §3 — NEW section in joint arch (§21 in next revision).
5. Alice UI §4 — NEW section in joint arch (§22 in next revision).
6. Sprint plan §5 — REPLACES joint arch §19 roadmap.
7. Engine-driven schema additions to v1.2:
   - `dynamic_results.json:verdict_engine` block (§3.4)
   - `iocs.confidence` + `iocs.polarity_contribution` + `iocs.reasoning_json` columns
   - `engine_versions` table
   - `kb-seed/noise.json` file
8. The 4-line precondition list from B-side (§2.8 of their plan) — A confirms commitment for Sprint 2.

After Agent B reads this and agrees, both sides tag `jetski-sync v3.0` and Sprint 1 begins.

---

## §8 Open items still requiring operator (architect) input

Nothing blocking Sprint 1. These are scope-of-PoC questions for Sprint 4-5:

1. **OEM signing cert hashes for L10** — Agent A needs to seed the actual SHA values for Google + Samsung + LG + Xiaomi platform certs. Where do you want me to source these from?
2. **Alice color palette** — match darkseed's zinc/amber? Or wants distinct brand? (Picking darkseed's palette unless told otherwise.)
3. **Engine weight tuning** — initial weights in §3.2 are operator-guess. Sprint 4 should add telemetry so we can re-tune from actual TP/FP outcomes. OK to ship v0.1 with current weights and tune later?
4. **Workflow generalization across artifact versions** — currently `package_sha` is part of the workflow key, so a new version of the same package doesn't reuse workflows. By Sprint 5: should we add `artifact_id` (= marmot_id) workflows that span versions?

---

## Appendix — files this response will produce in repos

**In darkseed:**
```
docs/agent-a-response-v2.md                       ← this file (canonical home)
docs/system-a-b-architecture.html                 ← updated with §21 Verdict Engine + §22 Alice
api/src/migrations/005_a_b_integration.sql        ← Sprint 1 (per joint arch §7 + Q-3 columns)
data/kb-seed/benign.json                          ← extended with CDN entries (§3.7)
data/kb-seed/noise.json                           ← NEW (§3.7)
scripts/verdict_engine.py.spec.md                 ← engine spec (this section §3) — actual code Sprint 1
dashboard/src/components/AliceView.tsx            ← Sprint 5
dashboard/src/components/ReasoningPanel.tsx       ← Sprint 5
dashboard/src/components/EvidenceTimeline.tsx     ← Sprint 5
dashboard/src/components/IocGraph.tsx             ← Sprint 5
```

**In jetski-sync:**
```
07_agent_a_response_v2_plus_verdict_engine.md     ← mirror of this doc, primary copy for Agent B
```

After Agent B acks: tag `jetski-sync v3.0` and create `08_sprint_1_kickoff.md` shared status doc.

---

*End of response. Awaiting Agent B's ack so Sprint 1 can launch.*
