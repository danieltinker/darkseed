# Score Decomposition Clarification — v3.1 schema lock

**From:** Agent B / darkseed planning side
**To:** Agent A (Gemini + Antigravity) + operator
**Date:** 2026-05-25
**Status:** SCHEMA LOCK — read before producing `13_*` v1.2 artifacts so they're correct on first regen
**Affects:** `execution_playbook.json:job_metadata`, `dynamic_results.json`, joint report frontmatter, darkseed `chains.severity_score`, Verdict Engine score recompute

---

## §0 The error in v1.2 as published yesterday

`fire-drill-spec.md §1.1` defined a single `static_score` field, treating it as one atomic number. The operator clarified: the score is **two distinct components, summed**.

| Component | Source | Mutable? | Owner |
|---|---|---|---|
| `metadata_score` | Tab-1 non-agentic automation (first scan; store metadata, install count, dev country, etc.) | **immutable** | Co-Reviewer (Agent A's host) |
| `rubric_score` | Agent A's deep static hunt (S11=8 + M3=4 etc.) | **immutable as static**; Agent B's dynamic verification mutates a parallel `rubric_verified_score` | Agent A static; Agent B dynamic |
| `static_score_total` | `metadata_score + rubric_score + bonus` | **derived** | display layer |

This is what reconciles Agent A's `10_*` data:
- App-context block: `static_score: 46` ← the displayed total
- Playbook JSON: `"riskware_score": 12` ← actually the rubric portion only

**Both were correct, just named ambiguously.** The fix is to give each component its own field.

---

## §1 Required schema fields (v1.2 final)

### `execution_playbook.json:job_metadata`
**REPLACES** the single `static_score` field with three explicit ones:

```jsonc
{
  "metadata_score": 30,                  // from first-scan automation; immutable on this contract
  "rubric_score": 12,                    // from A's deep static hunt; what B verifies dynamically
  "static_score_total": 46,              // = metadata_score + rubric_score + bonus; derived, displayed
  "score_formula": "metadata_score + rubric_score + (4 if manual_review_required else 0)"  // human-readable; optional
}
```

### `dynamic_results.json` (Agent B writes)
**EXTENDS** the verdict_engine block with the parallel "verified" fields:

```jsonc
{
  "metadata_score": 30,                  // echoed verbatim from playbook (B NEVER modifies)
  "rubric_score_static": 12,             // echoed; A's number
  "rubric_score_verified": 14,           // B's per-phase adjustment
  "verified_score_total": 48,            // = metadata_score + rubric_score_verified + bonus
  "verified_score_delta": +2,            // vs static_score_total
  "verdict_engine": {
    ...
    "rubric_score_breakdown": [
      {"rubric_id": "S11", "static": 8, "verified": 8, "delta": 0, "phase_verdicts": [...]},
      {"rubric_id": "M3", "static": 4, "verified": 6, "delta": +2, "phase_verdicts": [...]}
    ]
  }
}
```

### Joint report frontmatter
```yaml
scoring:
  metadata_score: 30
  rubric_score_static: 12
  rubric_score_verified: 14
  static_score_total: 46
  verified_score_total: 48
  delta: +2
```

### darkseed `chains` table — migration delta
```sql
-- migration 006: split severity_score into metadata + rubric components
ALTER TABLE chains ADD COLUMN metadata_score INTEGER;
ALTER TABLE chains ADD COLUMN rubric_score_static INTEGER;
ALTER TABLE chains ADD COLUMN rubric_score_verified INTEGER;
-- existing chains.severity_score becomes derived (= sum of above + bonus);
-- backfill: metadata_score = 0, rubric_score_static = severity_score, rubric_score_verified = severity_score
-- new chains: all three populated explicitly
```

### Alice UI (Sprint 5)
Score header renders as:
```
metadata 30  +  rubric 12 → 14 (+2)  =  total 46 → 48 (+2)
            └─────A─────┘  └──B──┘
```

---

## §2 Operating principles this locks in

1. **Agent B's verdict engine ONLY mutates `rubric_score_verified`.** The metadata portion is sacred — it's Co-Reviewer's domain, immutable on the joint contract, and never reflected in B's pipeline.
2. **Per-rubric breakdown is mandatory** so we can audit which rubrics moved the verified number.
3. **Total scores are derived, not stored.** Storing the total invites drift; computing on display = always consistent with components.
4. **When operator promotes a chain to TP or flips to FP, both numbers travel in the labels.jsonl row** — so future training can correlate metadata-portion contribution vs rubric-portion contribution to ground-truth verdicts.

---

## §3 One question for Agent A (resolve in `13_*`)

**Q: What's the exact formula producing `46` from `30 + 12 = 42`?**

The 4-point gap is unexplained. Likely candidates:

- (a) `manual_review_required: false` adds +4 (the playbook had `manual_review_required: false` per `10_*`)
- (b) High-confidence rubrics get +2 each (S11 high + M3 high = +4)
- (c) Phase count bonus (S11 has 2 phases × 0 = 0; M3 has 5 phases × ? = 4)
- (d) Operator-side display-only adjustment that's NOT part of the agent contract — we should treat `42` as canonical wire value

One-sentence answer is enough. If (d), I'll drop the `score_formula` field and use only the three components.

---

## §4 What Agent A needs to do

When regenerating v1.2 artifacts for the fire drill (per `12_*`):
1. Replace the single `riskware_score: 12` field in playbook with the three explicit fields above
2. Make sure `chain_seeded` POST to darkseed includes `metadata_score` + `rubric_score` separately (not a combined number)
3. Answer §3 above (or pick (d) "drop the bonus") so we model the total correctly

No regen of decompiled tarball, rubric MDs, hooks, mocks, or decryptors needed — those are unaffected.

---

## §5 What Agent B does (already updated locally)

- Verdict engine code: split internal score representation into `metadata_score + rubric_score`
- Migration `006_score_decomposition.sql` queued; will land Sprint 1 alongside migration 005
- `dynamic_results.json` schema v1.2 final: parallel verified-fields added
- Joint report template: scoring frontmatter block restructured
- `fire-drill-spec.md §4 validation checklist`: updated to check both components separately (so the 17 boxes stay valid; box #4 "static_score consistency" splits into "metadata_score immutable across the pipeline" + "rubric_score_static matches between playbook and dynamic_results")

---

## §6 v3.1 tag of jetski-sync

This is a minor revision — schema field rename, no architectural change. Cuts as:

```
jetski-sync v3.1: score decomposition clarification (metadata + rubric)
  - 13_score_decomposition_clarification.md (this doc, mirrored)
  - playbook field rename: riskware_score → {metadata_score, rubric_score, static_score_total}
  - parallel verified-fields in dynamic_results.json
  - darkseed migration 006 prepared
```

Tag happens after Agent A acks the schema fields in `13_*` and produces v1.2 artifacts compliant with the new shape.

---

*End of clarification. Agent A: please incorporate the three-field decomposition into your v1.2 regen and answer §3.*
