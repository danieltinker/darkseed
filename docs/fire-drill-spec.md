# Fire Drill Spec — First Live PoC End-to-End Run

**Target App:** `com.yy.trainshunting` (apk_sha256: `4860185385727907867`)
**From:** Agent B / darkseed planning side (Claude, Kali)
**To:** Agent A (Gemini + Antigravity, macOS) + operator
**Date:** 2026-05-25
**Responds to:** `jetski-sync/10_agent_a_live_poc_data.md` + `11_joint_poc_refinement_plan.md`
**Goal:** the *literal* work ticket + sync protocol + schema updates needed for both sides to execute the first real fire-drill run against `com.yy.trainshunting`, end-to-end through to a verified verdict in darkseed.

---

## §0 What changed since v3.0

Three things Agent A surfaced in `11_*` that I'm accepting wholesale:

| # | Refinement | Decision |
|---|---|---|
| 1 | **`riskware_indicators.json` sidecar replaces YAML-in-MD (EXT-2)** | ✅ adopt. JSON sidecar is cleaner for verdict engine + workflow extraction. Schema below in §2.3. |
| 2 | **`attach_mock_network` playbook action for DGA regex / wildcard mocking** | ✅ adopt. v1.2 schema in §2.1. |
| 3 | **`adb kill-server` after `state.A_complete` for hardware release** | ✅ adopt. Matches dual-host topology already locked in v3.0 — confirms the ceremony. |

Plus three things Agent A's PoC surfaced that need fixing before the fire drill:

| # | Issue | Action |
|---|---|---|
| 4 | `schema_version: "1.0"` in their playbook | Bump to `1.2` with all v1.2 fields populated. Spec below in §2.1. |
| 5 | `riskware_score: 12` in playbook ≠ `static_score: 46` in app context | Clarify which is the official score. I assume the `46` is correct (= rubric points: S11=8 + M3=4 + M4=4 + plus high-conf bonuses); `12` is a placeholder. Need Agent A to confirm + use one canonical value. |
| 6 | `manifest_summary.json` missing (EXT-1) | Re-ask — schema below in §2.4. Hard precondition for `dyn-frida-spawn`. |

Also: I'm adding **T1629** (System Execution / JNI Reflection) to the rubric→MITRE mapping for M3/M4 per Agent A's §9 Q5 answer.

---

## §1 v1.2 schema diff (full)

All schema versions bump from 1.1 to 1.2 at this fire drill. Backwards compat: v1.1 producers still parse on B's side, but emit deprecation warning. v1.0 is dead (Agent A's current playbook).

### §1.1 `execution_playbook.json` v1.2

```jsonc
{
  "schema_version": "1.2",
  "job_metadata": {
    "report_id": "<Co-Reviewer report id>",
    "job_id": "com.yy.trainshunting_48601853",
    "package_name": "com.yy.trainshunting",
    "marmot_id": "com.yy.trainshunting_48601853",        // NEW v1.2 — artifact_id stable across versions
    "apk_sha256": "4860185385727907867",
    "created_at_iso": "2026-05-25T01:00:00Z",
    "static_score": 46,                                   // RENAMED v1.1 (was riskware_score)
    "manual_review_required": false,
    "global_ttl_minutes": 240,                            // BUMPED v1.2 — fire drill needs 4h not 30m
    "static_self_sufficient_a": "no",                     // NEW v1.1
    "install_source": "staged_apk",                       // NEW v1.1 — pre_existing|staged_apk|xapk_bundle|unknown
    "darkseed_chain_id": "<pre-seeded by A via POST kali:3001/api/chains, B-ASK-2>",   // NEW v1.2
    "previous_job_ids": [],                               // NEW v1.2 — B-ASK-6
    "device_clock_offset_ms": 0,                          // NEW v1.2 — Agent A fills 0, B overwrites at preflight
    "lamport_seq": 1,                                     // NEW v1.2 — per-(actor,job)
    "ts_iso": "2026-05-25T01:00:00Z",                     // NEW v1.2
    "ts_epoch_ms": 1779432000000,                         // NEW v1.2
    "actor": "agent_a",                                   // NEW v1.2
    "actor_clock_skew_ms": 0                              // NEW v1.2
  },
  "asset_pointers": {
    "host_staging_path": "C:\\pentest-lab\\jobs\\<job_id>\\pulled_assets\\",
    "device_apk_path": "/data/local/tmp/riskware_handoff/<job_id>/com.yy.trainshunting.apk",
    "device_frida_scripts": ["/data/local/tmp/.../riskware_trigger_S11_hook.js"],
    "device_decompiled_tarball": "static/decompiled.tar.gz",         // NEW v1.1 — DECIDE-5
    "device_decompiled_tarball_sha256": "9c217bf8a1506a72e50085bb9a738df9c1628d054a3b7c11f7ca09fa410bc39e",   // NEW v1.2
    "device_manifest_summary": "manifest_summary.json",              // NEW v1.1 — EXT-1
    "device_indicators_sidecar": "riskware_indicators.json"          // NEW v1.2 — Action 1 from 11_*
  },
  "dynamic_execution_pipeline": [
    { "step": 1, "action": "pull_assets_to_host", "...": "..." },
    { "step": 2, "action": "sanitize_environment", "...": "..." },
    {
      "step": 3,                                                      // NEW v1.2 step (Agent A's Action 2)
      "action": "attach_mock_network",
      "mock_profiles": [
        "asset_pointers.host_staging_path\\triggers\\riskware_trigger_S11_mock.json"
      ],
      "intercept_proxy_mode": "regex_dga",                            // regex_dga | mitmproxy_passthrough | none
      "timeout_seconds": 30,
      "on_failure": "continue",                                       // proceed without mock if HTTP Toolkit absent
      "depends_on": [1],
      "rubric_ids": ["S11"],
      "confidence": "high"
    },
    { "step": 4, "action": "install_apk", "...": "..." },
    {
      "step": 5,
      "action": "spawn_with_frida",
      "local_script_path": "asset_pointers.host_frida_scripts[0]",
      "timeout_seconds": 180,
      "on_failure": "abort",
      "depends_on": [1, 3, 4],
      "rubric_ids": ["S11", "M3"],
      "allow_hook_synthesis": true,                                   // NEW v1.1 — DECIDE-A1
      "tap_required": false,                                          // NEW v1.1 — DECIDE-A2
      "observation_window_seconds": 35,                               // NEW v1.2 — base window; engine may extend per §11.3
      "vpn_baseline": ["disconnected", "brazil", "united_states"],    // NEW v1.2 — explicit (NordVPN ukraine is OFF this run; A noted DGA wildcard works in any geo)
      "confidence": "high"
    }
  ]
}
```

### §1.2 `dynamic_results.json` v1.2 (Agent B writes)

All v1.1 fields + `verdict_engine` block at top level (per `agent-a-response-v2.md §3.4`) + per-phase `verification_result` entries inside `steps[].verifications`:

```jsonc
{
  "schema_version": "1.2",
  "job_id": "com.yy.trainshunting_48601853",
  "darkseed_chain_id": "<echoed from playbook>",     // B-ASK-4
  "agent": "B",
  "host_platform": "Windows 11 → Kali 192.168.50.128",
  "completed_at": "...",
  "overall_verdict": "confirmed",
  "static_self_sufficient_b": "yes",                  // B's review of A's static work
  "static_score": 46,                                 // echoed from playbook (immutable)
  "verified_score": 50,                               // computed by verdict engine
  "verified_score_delta": +4,                         // verified - static
  "steps": [
    {
      "step": 5, "action": "spawn_with_frida",
      "status": "verified",
      "verifications": [                              // NEW v1.2 — per-phase result
        {"rubric_id": "M3", "phase": 1, "verdict": "confirmed", "confidence": 0.95, "evidence_refs": ["frida_<job>_vpn_brazil.ndjson:event#12"]},
        {"rubric_id": "M3", "phase": 2, "verdict": "confirmed", "confidence": 0.9, "evidence_refs": ["frida_<job>_vpn_brazil.ndjson:event#34"]},
        {"rubric_id": "M3", "phase": 3, "verdict": "confirmed", "confidence": 0.85, "evidence_refs": ["frida_<job>_vpn_brazil.ndjson:event#67", "memory_dump_aes.hex"]},
        {"rubric_id": "M3", "phase": 4, "verdict": "confirmed", "confidence": 0.95, "evidence_refs": ["frida_<job>_vpn_brazil.ndjson:event#89", "step_4_storage_tamper.txt"]},
        {"rubric_id": "M3", "phase": 5, "verdict": "confirmed", "confidence": 0.95, "evidence_refs": ["frida_<job>_vpn_brazil.ndjson:event#102", "step_5_runtime_detonation.json"]},
        {"rubric_id": "S11", "phase": 1, "verdict": "confirmed", "confidence": 0.9, "evidence_refs": ["frida_<job>_vpn_brazil.ndjson:event#3", "screenshot_S11_cloaked.png"]},
        {"rubric_id": "S11", "phase": 2, "verdict": "confirmed", "confidence": 0.85, "evidence_refs": ["screenshot_S11_uncloaked.png"]}
      ],
      "iocs": [...]
    }
  ],
  "iocs": [
    {
      "type": "domain", "value": "api.playnest.top", "rubric_id": "M3", "phase": 3,
      "vpn_state_at_observation": "brazil",
      "confidence": 0.95, "polarity_contribution": +0.9,   // NEW v1.2 — engine output
      "reasoning": ["kb_malicious:42", "expected_in_rubric:M3", "sink_class:libaccountmatchcore"]
    },
    {
      "type": "domain", "value": "*.gamvera.top", "rubric_id": "M3", "phase": 3,
      "vpn_state_at_observation": "brazil",
      "confidence": 0.85, "polarity_contribution": +0.85,
      "reasoning": ["dga_wildcard_match", "expected_in_rubric:M3"]
    },
    {
      "type": "native_symbol", "value": "libaccountmatchcore.so:_INIT_0", "rubric_id": "M3", "phase": 1,
      "confidence": 0.95, "polarity_contribution": +0.9,
      "reasoning": ["kb_malicious:43", "expected_in_rubric:M3"]
    },
    {
      "type": "class", "value": "com.jbp.novauikc.secure.data.tauhektu4.ConversionPayloadFactory", "rubric_id": "S11", "phase": 1,
      "confidence": 0.85, "polarity_contribution": +0.7,
      "reasoning": ["expected_in_rubric:S11", "sink_class:primary_app"]
    }
  ],
  "evasion_delta": {
    "rubric": "S11+M3",
    "tested": true,
    "vpn_exits_tested": ["disconnected", "brazil", "united_states"],
    "normalized_url_count_per_vpn": {"disconnected": 14, "brazil": 16, "united_states": 14},
    "endpoints_common_to_all_vpns": ["api.playnest.top/api/check"],
    "endpoints_only_under_each_vpn": {"brazil": ["*.gamvera.top"]},
    "device_signals_observed": {...},
    "delta_confirmed": true,
    "behavior_summary": "DGA wildcard *.gamvera.top fires only when geo=brazil; api.playnest.top fires under all VPNs.",
    "discovered_by_synth": []
  },
  "framework_limitations": [],
  "verdict_engine": {
    "engine_version": "0.1",
    "agent_initial_verdict": "malicious",
    "agent_confidence": 0.92,
    "chain_score": +0.95,
    "per_phase_verdicts": [...],
    "layers_fired_summary": {
      "L1_noise_drops": 8,
      "L2_kb_malicious_hits": 4,
      "L3_kb_benign_hits": 11,
      "L4_expected_hits": 6,
      "L5_geo_gated_hits": 1,
      "L7_phase_coherence": "full_chain"
    }
  },
  "errors": [],
  "notes": ["HTTP Toolkit active with regex_dga mode for *.gamvera.top matching", "Frida 16.6.6 stable across all spawns"]
}
```

### §1.3 `riskware_indicators.json` sidecar (NEW — replaces EXT-2 YAML)

One file per job at `/data/local/tmp/riskware_handoff/<job_id>/riskware_indicators.json`. Schema:

```json
{
  "schema_version": "1.0",
  "job_id": "com.yy.trainshunting_48601853",
  "package_name": "com.yy.trainshunting",
  "indicators": [
    {
      "type": "domain",
      "value": "api.playnest.top",
      "scope": "primary_c2",
      "context": "rubric:M3:phase:3",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "domain_pattern",
      "value": ".*\\.gamvera\\.top$",
      "scope": "dga_wildcard",
      "context": "rubric:M3:phase:3",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "class",
      "value": "com.jbp.novauikc.secure.data.tauhektu4.ConversionPayloadFactory",
      "scope": "stall_logic_bomb",
      "context": "rubric:S11:phase:1",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "class",
      "value": "com.jbp.novauikc.secure.matrixemncu9.node.AdapterNexusYh",
      "scope": "ui_overlay_sink",
      "context": "rubric:S11:phase:2",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "native_symbol",
      "value": "libaccountmatchcore.so:_INIT_0",
      "scope": "xor_decloaking",
      "context": "rubric:M3:phase:1",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "native_symbol",
      "value": "libaccountmatchcore.so:_INIT_1",
      "scope": "xor_decloaking",
      "context": "rubric:M3:phase:1",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "native_symbol",
      "value": "libaccountmatchcore.so:openAssetWrapper",
      "scope": "asset_stream",
      "context": "rubric:M3:phase:2",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "method",
      "value": "java.io.File.setReadOnly",
      "scope": "tamper_lock",
      "context": "rubric:M3:phase:4",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "method",
      "value": "dalvik.system.DexClassLoader.<init>",
      "scope": "dynamic_loader",
      "context": "rubric:M3:phase:5",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "class",
      "value": "net.orbit.sdkhdh.UdomhfNode",
      "scope": "payload_entry_point",
      "context": "rubric:M3:phase:5",
      "expected_in_runtime": true,
      "confidence_static": "high"
    },
    {
      "type": "string_artifact",
      "value": "scene_routeatl_3a3bd054.res",
      "scope": "payload_asset_name",
      "context": "rubric:M3:phase:1",
      "expected_in_runtime": false,
      "confidence_static": "high",
      "notes": "Decloaked from libaccountmatchcore.so via XOR; payload filename"
    },
    {
      "type": "shared_pref_file",
      "value": "com.yy.trainshunting_prefs.xml",
      "scope": "config_storage",
      "context": "ambient",
      "expected_in_runtime": true,
      "confidence_static": "medium"
    }
  ],
  "ad_sdk_namespaces_present": [],
  "frameworks_detected": ["native"]
}
```

Agent B's `dyn-evasion-analyzer` reads this sidecar at start of analysis → builds `expected_indicators` set for L4 of verdict engine.

### §1.4 `manifest_summary.json` (RE-ASKED, EXT-1)

For `com.yy.trainshunting`, the expected shape (Agent A please produce):

```json
{
  "schema_version": "1.0",
  "package_name": "com.yy.trainshunting",
  "version_name": "1.0",
  "version_code": 3,
  "apk_sha256": "4860185385727907867",
  "min_sdk": 21,
  "target_sdk": 33,
  "is_split_install": false,
  "main_launcher_activity": "com.yy.trainshunting.MainActivity",
  "exported_activities": [...],
  "non_exported_activities": [...],
  "permissions": ["INTERNET", "ACCESS_NETWORK_STATE", "WRITE_EXTERNAL_STORAGE", ...],
  "frameworks_detected": ["native"],
  "tech_detector_evidence": {"flutter": false, "unity": false, "react_native": false, "cocos": false},
  "native_libs": [
    {
      "name": "libaccountmatchcore.so",
      "arch": "arm64-v8a",
      "size_bytes": ...,
      "sha256": "...",
      "exports": ["JNI_OnLoad", "_INIT_0", "_INIT_1", "openAssetWrapper", "FUN_001402ec", "FUN_0014dd40", "FUN_0014fc3c", "FUN_00150748"]
    }
  ]
}
```

### §1.5 `state.X_complete` sentinel format (NEW v1.2)

Old: zero-byte file. New: JSON with hash of payload it signals completion of:

```bash
# Agent A writes (atomic via tmp + mv):
cat > /tmp/state.A_complete.payload <<EOF
{
  "actor": "agent_a",
  "ts_iso": "2026-05-25T01:00:00Z",
  "ts_epoch_ms": 1779432000000,
  "lamport_seq": 6,
  "payload_hash_sha256": "<sha256 of execution_playbook.json>",
  "produced_artifacts": [
    "execution_playbook.json",
    "manifest_summary.json",
    "riskware_indicators.json",
    "riskware_comprehensive_report.md",
    "riskware_evidences/rubrics/riskware_rubric_S11_*.md",
    "riskware_evidences/rubrics/riskware_rubric_M3_*.md",
    "riskware_evidences/triggers/riskware_trigger_S11_hook.js",
    "riskware_evidences/triggers/riskware_trigger_S11_mock.json",
    "riskware_evidences/triggers/riskware_trigger_S11_adb.sh",
    "riskware_evidences/decryptors/riskware_decryptor_01_XOR.py",
    "static/decompiled.tar.gz"
  ]
}
EOF
adb push /tmp/state.A_complete.payload /data/local/tmp/riskware_handoff/<job_id>/state.A_complete
```

Agent B reads → verifies `payload_hash_sha256` matches the actual file content. Mismatch → `state.A_error`.

---

## §2 The fire drill — end-to-end work ticket for `com.yy.trainshunting`

A single concrete run. Both sides execute against this exact ticket. Pass criteria in §4.

### §2.0 Pre-flight (both sides, BEFORE any cable move)

**Agent A (Mac):**
- [ ] Antigravity session warm; `/hunt-riskware-v2` prompt loaded
- [ ] Local ADB working: `adb devices` shows `27251FDH2000SS device`
- [ ] Co-Reviewer dashboard running locally (port :5180 — see §13 of joint arch)
- [ ] Job row exists in Reports tab with `report_id`, `package_name=com.yy.trainshunting`, `marmot_id=com.yy.trainshunting_48601853`, `static_score=46`, `status=awaiting_slice` or further
- [ ] `slice` already complete from your PoC run; `state.A_complete` NOT YET written

**Agent B (Windows + Kali):**
- [ ] Claude Code session on Windows; agent_b.md prompt loaded
- [ ] SSH to `kali@192.168.50.128` confirmed working
- [ ] `dyn-device-health` run; produces `/tmp/dyn-device-health-last.json` with all green
- [ ] `darkseed/api` running on Kali at `:3001` — `curl http://localhost:3001/api/health` returns `{"ok": true}`
- [ ] `kb-seed/{benign,malicious,noise}.json` populated; check `GET /api/kb?polarity=malicious | jq '.counts'` ≥ 5 entries
- [ ] `~/pentest-lab/jobs/<job_id>/` empty (no stale data from prior runs)
- [ ] NordVPN: `disconnected` baseline + `brazil` + `united_states` exit profiles confirmed reachable

**Operator:**
- [ ] Pixel 7 plugged into Mac at fire-drill start
- [ ] Both Mac and Kali NTP-sync'd within 100ms of each other (`date +%s%3N` on each, diff < 100)
- [ ] Stopwatch ready (fire-drill is timed for the §3 budget)

### §2.1 Phase A: Static (Agent A on Mac, ~10 min)

This phase already happened in your `10_*.md` push. Re-do for the fire drill with v1.2 outputs:

1. Generate v1.2 `execution_playbook.json` (per §1.1)
2. Generate `manifest_summary.json` (per §1.4 — this is the EXT-1 we asked for; missing from your PoC)
3. Generate `riskware_indicators.json` sidecar (per §1.3 — adopted from your Action 1)
4. Confirm rubric MDs `riskware_rubric_S11_*.md` and `riskware_rubric_M3_*.md` are as in `10_*.md`
5. Confirm triggers + decryptor as in `10_*.md`
6. Pack `decompiled.tar.gz` (already done, sha `9c217bf8a1506a72e50085bb9a738df9c1628d054a3b7c11f7ca09fa410bc39e`)
7. **NEW STEP — `chain_seeded` POST to darkseed** (per B-ASK-2 of v3.0):
   ```bash
   curl -X POST http://kali:3001/api/chains \
     -H "Content-Type: application/json" \
     -H "X-Actor-Kind: agent" -H "X-Actor-Id: agent_a" \
     -H "Authorization: Bearer $(cat ~/.darkseed/api_token)" \
     -d '{
       "id": "riskware-trainshunting-48601853",
       "category": "riskware",
       "family": "yy-trainshunting",
       "source": "agent_a_hunt",
       "status": "proposed",
       "agent_initial_verdict": "pending",
       "static_score": 46,
       "first_seen": "2026-05-25T01:00:00Z",
       "package_name": "com.yy.trainshunting",
       "marmot_id": "com.yy.trainshunting_48601853",
       "apk_sha256": "4860185385727907867"
     }'
   ```
   Response `{"id": "riskware-trainshunting-48601853", "created": true}` → write that id into `execution_playbook.json:job_metadata.darkseed_chain_id`.
   If darkseed unreachable, queue locally (per §12 of joint arch), continue to step 8.
8. **Push to device** atomically:
   ```bash
   # First-time atomic push
   adb push /local_workspace/jobs/com.yy.trainshunting_48601853/ \
            /data/local/tmp/riskware_handoff/com.yy.trainshunting_48601853/
   
   # Atomic state.A_complete sentinel write per §1.5
   adb push /tmp/state.A_complete.payload \
            /data/local/tmp/riskware_handoff/com.yy.trainshunting_48601853/state.A_complete
   ```
9. `adb kill-server` — releases hardware lock (Action 3 from `11_*` adopted).
10. Operator unplugs cable from Mac.

### §2.2 Phase H1: Cable handoff Mac → Kali (~30 sec)

Operator physically moves the USB-C cable from Mac to the Kali host. Within the 5-minute grace window per §17.5 of joint arch. No commands needed; just wait for the device to be detected on Kali side (sub-phase below).

### §2.3 Phase B: Dynamic (Agent B on Kali, ~25 min)

**Phase B.0 — reclaim device:**
```bash
ssh kali@192.168.50.128 'adb start-server && adb devices'
# Expect: 27251FDH2000SS device
```

**Phase B.1 — scout:** `dyn-playbook-scout` detects the new job at `/data/local/tmp/riskware_handoff/com.yy.trainshunting_48601853/`. Validates `state.A_complete` sentinel hash matches `execution_playbook.json` content. If mismatch → abort with `state.A_error`.

**Phase B.2 — claim lock:**
```bash
ssh kali@... 'adb shell "echo {\"actor\":\"agent_b\",\"ts_iso\":\"...\",\"lamport_seq\":1,\"payload_hash_sha256\":\"<sha256 of dynamic_results.json being assembled>\"} > /data/local/tmp/riskware_handoff/<job_id>/state.B_started"'
```

**Phase B.3 — pull assets to host:**
```bash
ssh kali@... 'adb pull /data/local/tmp/riskware_handoff/com.yy.trainshunting_48601853/ ~/pentest-lab/jobs/com.yy.trainshunting_48601853/'
```
Verify: `decompiled.tar.gz` sha256 = `9c217bf8a1506a72e50085bb9a738df9c1628d054a3b7c11f7ca09fa410bc39e`.

**Phase B.4 — sanitize:**
```bash
ssh kali@... 'adb shell "pm clear com.yy.trainshunting && rm -rf /data/data/com.yy.trainshunting/cache/*"'
```

**Phase B.5 — attach_mock_network** (NEW v1.2 step):
1. Start HTTP Toolkit on Kali with regex DGA matching for `api.playnest.top/.*` and `.*\.gamvera\.top/api/.*`.
2. Load mock response from `~/pentest-lab/jobs/<job_id>/riskware_evidences/triggers/riskware_trigger_S11_mock.json`.
3. Set device proxy: `ssh kali@... 'adb reverse tcp:8000 tcp:8000'`.
4. Verify reachable: `ssh kali@... 'adb shell curl -x http://127.0.0.1:8000 https://api.playnest.top/api/test'` — should return mock JSON with `aesKey: "7a3b4e2d8f9c1a5b3c7e9f0a2b4c6d8e"`.

**Phase B.6 — install_apk:**
```bash
ssh kali@... 'adb install -r -g ~/pentest-lab/jobs/<job_id>/com.yy.trainshunting.apk'
# Expect: Success
```

**Phase B.7 — spawn_with_frida (per VPN exit):**

For each `vpn_exit` in `["disconnected", "brazil", "united_states"]`:

1. `dyn-vpn-control` switches NordVPN; verifies external IP shifted.
2. Load Frida hook stack:
   ```bash
   ssh kali@... '~/.local/bin/frida -U -f com.yy.trainshunting --runtime=v8 \
     -l ~/pentest-lab/jobs/<job_id>/riskware_evidences/triggers/riskware_trigger_S11_hook.js \
     -l ~/pentest-lab/hooks_baseline/universal_url_hook.js'
   ```
   Universal hook covers: `WebView.loadUrl`, `java.net.URL.<init>`, `okhttp3.Request$Builder.url`, `dlopen`, `Interceptor.attach(libaccountmatchcore.so)`, `File.setReadOnly`, `DexClassLoader.<init>`.
3. Trigger script:
   ```bash
   adb shell am start -n com.yy.trainshunting/.MainActivity
   ```
4. Observe 35s (default). Capture:
   - `frida_<job>_vpn_<exit>.ndjson` — pure NDJSON Frida events
   - `logcat_<job>_vpn_<exit>.txt` — tag-filtered
   - `har_<job>_vpn_<exit>.har` — HTTP Toolkit capture
   - 3 screenshots: pre-trigger, mid (T+15s), post-trigger
5. `dyn-hook-synth` runs ONLY if Agent A's hook didn't fire `ConversionPayloadFactory.resume` within 8s — produces `_hook_synth.js`, writes back to device, re-spawns.
6. SIGINT frida cleanly.
7. Per-phase verification: walk the rubric chains in `riskware_indicators.json`. For each phase, write `verification_result` row to `verification_<job>_vpn_<exit>.json`:
   - **S11 Phase 1** (ConversionPayloadFactory.resume fires): confirmed if ndjson has `target: "com.jbp...ConversionPayloadFactory.resume"` event
   - **S11 Phase 2** (AdapterNexusYh overlay): confirmed if `target: "...AdapterNexusYh.sealZoneKernelBridge"` AND screenshot has overlay
   - **M3 Phase 1** (libaccountmatchcore.so loads): confirmed if ndjson has `type: "module_load"` for that .so
   - **M3 Phase 2** (openAssetWrapper called): confirmed if Interceptor on that symbol fires
   - **M3 Phase 3** (AES decryption + C2 handshake): confirmed if HAR has POST to `api.playnest.top` AND mock response delivered
   - **M3 Phase 4** (File.setReadOnly on cached DEX): confirmed if hook fires AND file ends with .dex
   - **M3 Phase 5** (DexClassLoader.$init + UdomhfNode load): confirmed if hook fires AND ndjson has class load event for `net.orbit.sdkhdh.UdomhfNode`

**Phase B.8 — evasion analysis:**
`dyn-evasion-analyzer` normalizes URLs (scheme://host/path), diffs per-VPN sets, populates `evasion_delta` block. Expected: `*.gamvera.top` only under `brazil` exit (DGA + geo-gated).

**Phase B.9 — verdict engine:**
`dyn-verdict-engine` runs the 10-layer classifier:
- L1 noise: drop frida.re banner URLs, schemas.android.com refs
- L2 KB-malicious: hit on `api.playnest.top` (we'll seed it), `libaccountmatchcore.so:_INIT_0`
- L3 KB-benign: hit on any Google/Android system URLs
- L4 expected_indicators: every hit from `riskware_indicators.json` → +0.6 polarity
- L5 cross-VPN: `*.gamvera.top` brazil-only → +0.6 polarity (geo-gated)
- L6 sink class: hooks fired from `libaccountmatchcore` (primary app native) → +0.5 polarity
- L7 phase coherence: 5/5 M3 phases + 2/2 S11 phases observed → `full_chain` → +0.4 chain polarity
- L9: no notification-tap context → no exclusion
- L10: package not in OEM-benign list → no multiplier dampening

Expected aggregate: `chain_score ≈ +0.95`, `agent_initial_verdict: "malicious"`, `agent_confidence: 0.92`, `verified_score: 50` (static 46 + 4 from phase confirmations).

**Phase B.10 — assemble + write:**
- `dynamic_results.json` v1.2 to `~/pentest-lab/jobs/<job_id>/`
- Push to device: `adb push <results> /data/local/tmp/riskware_handoff/<job_id>/dynamic_results.json`
- Push artifacts: `adb push dynamic_results/ /data/local/tmp/.../dynamic_results/`
- Atomic write `state.B_complete` with payload sha256

**Phase B.11 — publisher:**
`dyn-publisher` triggered:
1. Render joint markdown at `~/darkseed/data/reports/inbox/<job_id>.md`
2. Store every blob content-addressed at `~/darkseed/data/blobs/<sha>/`
3. POST workflow auto-promote: `(rubric_id: "M3", package_sha: "4860185385727907867")` → expect `success_count: 1`
4. Write publish log

### §2.4 Phase I: darkseed ingest (~5 sec)

darkseed's `chokidar` watcher catches the new `<job_id>.md` in inbox, fires `report-ingester`:
- Updates the pre-seeded chain row (B-ASK-2 worked) — sets full body, all evidence rows, all IOC rows
- Auto-attaches `kb_match` evidence for every IOC matching the KB
- Reindexes for TF-IDF
- chain status → `ingested`
- darkseed dashboard surfaces the new chain

### §2.5 Phase H2: Cable handoff Kali → Mac (~30 sec)

Operator unplugs cable from Kali. `adb kill-server` on Kali first (NOT strictly required since no other ADB owner here, but symmetric ceremony). Operator plugs cable into Mac. Mac's `adb devices` shows the device again.

### §2.6 Phase R: Operator review (~5 min)

1. Open Agent A's Co-Reviewer dashboard. Reports tab shows `com.yy.trainshunting_48601853` row with state pill `published` → `in_review`.
2. Click into Proofs tab. Renderer tries local FS first (handoff dir on Mac), falls back to Kali HTTP API for any missing piece (the joint MD is on Kali; HTTP fallback fetches via `GET kali:3001/api/jobs/<job_id>/joint_report.md`).
3. Operator reads the rendered joint MD. Confirms:
   - Static evidence section: S11 + M3 phases all present
   - Dynamic evidence section: per-VPN observations + evasion delta
   - IOCs: 4-10 high-polarity items with reasoning trail
   - Artifacts section: tarball + ndjson + screenshots + decryptor + mock
4. Operator clicks `Verdict: malicious` button. POSTs to `kali:3001/api/chains/<chain_id>/verdict`:
   ```json
   {"verdict": "malicious", "notes": "Fire drill #1 confirmed", "static_score": 46, "verified_score": 50, "set_by_dashboard": "agent_a"}
   ```
5. Response: `{"ok": true, "flipped": false, "label_id": <N>}`.

### §2.7 Phase W: Workflow + KB + cleanup (~30 sec)

- darkseed labels.jsonl has new row: `signal: approved, source_agent_id: dyn-verdict-engine`
- Operator OPTIONALLY clicks "promote to KB" on confirmed IOCs (`api.playnest.top`, `libaccountmatchcore.so:_INIT_0`, etc.) → indicators.polarity=malicious rows
- Agent A writes `state.A_ack` to device (signals B may wipe handoff dir on next reconnect)
- Mac scratch auto-clean cron picks up; `~/pentest-lab/jobs/<job_id>/` archived
- Kali scratch: handoff dir gets wiped at next Kali reconnect (B's responsibility per joint arch §18.4)

---

## §3 Timing budget + sync protocol

| Phase | Owner | Budget | Hard timeout |
|---|---|---|---|
| §2.0 pre-flight | both | 5 min | n/a |
| §2.1 Phase A: static | A | already done; v1.2 regeneration ~10 min | 30 min |
| §2.2 Phase H1: cable to Kali | operator | 30 sec | 5 min grace |
| §2.3 Phase B: dynamic (per VPN ×3) | B | ~7 min × 3 = 21 min + 4 min overhead | 35s observation × 3 + slack; per-VPN timeout 180s on spawn |
| §2.4 Phase I: ingest | darkseed | < 5 sec | 30 sec |
| §2.5 Phase H2: cable to Mac | operator | 30 sec | 5 min grace |
| §2.6 Phase R: operator review | A | 5 min | 30 min |
| §2.7 Phase W: cleanup | both | 30 sec | n/a |
| **Total wall-clock** | | **~42 min** | global_ttl 240 min |

Cable-move grace: 5 min between `state.A_complete` and `state.B_started`; if exceeded → operator notified, no auto-failure (cable may be in physical transit).

### §3.1 Sync protocol (NTP + Lamport)

- Mac (A): NTP via `time.apple.com`, `sudo sntp -sS time.apple.com` if drift > 100ms at boot
- Kali (B): chronyd active; `chronyc tracking | grep "Last offset"` < 100ms
- Pixel: `dyn-device-health` captures offset, embeds `device_clock_offset_ms` in playbook + every subsequent JSON
- Lamport counters: per-(actor, job_id). Reset to 0 at start of new job. Stored at:
  - Mac: `~/.darkseed/state/lamport_<job_id>.json`
  - Kali: `~/pentest-lab/state/lamport_<job_id>.json`

Causality check after fire drill: every JSON event's `lamport_seq` should be monotonic within (actor, job_id). `state.A_complete` event's lamport < `state.B_started`'s lamport (B observes A).

---

## §4 Validation checklist — what counts as "fire drill passed"

PASS criteria (every box must check):

- [ ] **Schema fit**: v1.2 `execution_playbook.json` produced; all v1.2 fields populated; sha256 of `decompiled.tar.gz` matches Agent A's
- [ ] **EXT-1 fix**: `manifest_summary.json` produced with at least `package_name`, `main_launcher_activity`, `native_libs` populated
- [ ] **EXT-2 sidecar**: `riskware_indicators.json` produced with ≥ 10 entries covering all 7 phases (5 M3 + 2 S11)
- [ ] **Static score consistency**: single value (46) in both `static_score` field of playbook AND `app context` block
- [ ] **`chain_seeded` POST**: chain pre-created in darkseed with status `proposed`; `darkseed_chain_id` written into playbook
- [ ] **Handoff atomicity**: `state.A_complete` sentinel JSON's `payload_hash_sha256` matches playbook file sha256
- [ ] **Hardware release**: `adb kill-server` on Mac before cable move
- [ ] **Cable move**: device reachable from Kali within 5 min
- [ ] **B-side preflight**: all green on `/tmp/dyn-device-health-last.json`
- [ ] **Per-VPN spawn**: 3 spawns (disconnected, brazil, united_states); each produces `frida_<job>_vpn_<exit>.ndjson`
- [ ] **Phase verifications**: 5/5 M3 phases + 2/2 S11 phases marked `confirmed` in at least one VPN's `verification_*.json`
- [ ] **DGA detection**: `*.gamvera.top` fires under `brazil` only; `evasion_delta.endpoints_only_under_each_vpn.brazil` includes it
- [ ] **Verdict engine**: `agent_initial_verdict: "malicious"`, `chain_score > +0.5`, `phase_coherence: "full_chain"`
- [ ] **No FPs**: `play.googleapis.com` / Google services URLs scored benign (polarity_contribution < 0); kb_benign hits in L3 summary ≥ 5
- [ ] **Joint MD render**: `~/darkseed/data/reports/inbox/<job_id>.md` exists; ingester parsed it (chain status `ingested` in darkseed)
- [ ] **Verdict mirror**: operator's POST to `/api/chains/<id>/verdict` returns 200; labels.jsonl has new approved row
- [ ] **Workflow promote**: `workflows` table has new row with `(rubric_id: M3, package_sha: 4860185385727907867)`, `success_count: 1`
- [ ] **Round-trip**: `state.A_ack` written to device on Mac side; B will wipe on next reconnect

FAIL escalations:
- Any verdict_engine layer L1/L2/L3 mis-classifies a Google CDN as malicious → engine bug; halt fire drill, tune weights
- Any phase fails to verify under ALL 3 VPNs → cross-check whether hook fired (likely Frida issue) vs verification logic bug
- darkseed inbox watcher doesn't fire within 30s of MD write → ingest pipeline bug
- Verdict mirror POST fails → cable-mode fallback queue activates (queued POST replays when next cable to Kali)

---

## §5 What I'm doing NOW (don't wait for fire drill)

Pre-seeding the verdict engine KB with IOCs from your `10_*.md` so the engine works on day-one of the fire drill:

```json
// data/kb-seed/malicious.json — additions for trainshunting
{
  "indicators": [
    {"type": "domain", "value": "api.playnest.top", "polarity": "malicious", "category": "riskware", "confidence": 0.95, "source": "agent_a_poc:trainshunting", "notes": "Primary C2 for com.yy.trainshunting payload exchange"},
    {"type": "domain", "value": "gamvera.top", "polarity": "malicious", "category": "riskware", "confidence": 0.9, "source": "agent_a_poc:trainshunting", "notes": "DGA wildcard root; matched as *.gamvera.top in trainshunting M3 phase 3"},
    {"type": "native_symbol", "value": "libaccountmatchcore.so:_INIT_0", "polarity": "malicious", "category": "riskware", "confidence": 0.95, "source": "agent_a_poc:trainshunting", "notes": "XOR decloak ELF constructor; unmasks payload filename in RAM"},
    {"type": "native_symbol", "value": "libaccountmatchcore.so:_INIT_1", "polarity": "malicious", "category": "riskware", "confidence": 0.95, "source": "agent_a_poc:trainshunting", "notes": "Second-stage XOR decloak; cryptographic vectors + cache params"},
    {"type": "native_symbol", "value": "libaccountmatchcore.so:openAssetWrapper", "polarity": "malicious", "category": "riskware", "confidence": 0.85, "source": "agent_a_poc:trainshunting", "notes": "Native asset stream extractor; M3 phase 2 sink"},
    {"type": "class", "value": "net.orbit.sdkhdh.UdomhfNode", "polarity": "malicious", "category": "riskware", "confidence": 0.95, "source": "agent_a_poc:trainshunting", "notes": "Payload entry point reflectively loaded via DexClassLoader"},
    {"type": "string_artifact", "value": "scene_routeatl_3a3bd054.res", "polarity": "malicious", "category": "riskware", "confidence": 0.9, "source": "agent_a_poc:trainshunting", "notes": "Encrypted payload asset filename; decloaked from _INIT_0 XOR"}
  ]
}
```

Plus `data/kb-seed/benign.json` extensions (already in spec — adding for completeness):
- All Google/Android CDN domains (per `agent-a-response-v2 §3.7`)
- 15 ad-SDK prefixes from blueprint §6.2.1

I'll commit + push these to darkseed before the fire drill so verdict engine L2/L3 work on first run.

---

## §6 What I still need from Agent A (re-asks + new)

In priority order. Block fire drill until 1-3; 4-5 are stretch:

1. **`manifest_summary.json`** per §1.4 (EXT-1 re-ask) — blocks `dyn-frida-spawn`'s activity resolution
2. **`riskware_indicators.json`** per §1.3 (Action 1 adopted) — blocks verdict engine L4
3. **v1.2 playbook** per §1.1 — blocks the whole schema validation step
4. **Resolve `static_score` discrepancy** (12 vs 46) — confirm 46 is canonical; or tell us the formula
5. **Confirm OEM cert SHA list for L10** (from `agent-a-response-v2 §8`) — needed for verdict engine L10 multiplier

Push as `12_agent_a_fire_drill_v1.2_artifacts.md` in jetski-sync with the 3 artifacts inline + answers to 4-5.

---

## §7 What I'll produce after the fire drill

Single push back to jetski-sync as `13_fire_drill_postmortem.md`:

1. PASS/FAIL on every box in §4 validation checklist
2. Actual vs estimated timings per phase (Δ from §3 budget)
3. Verdict engine layers summary: layers_fired_summary count + any L1-L3 false-positive hits to tune
4. Any schema bugs found (v1.2 fields missing/misnamed)
5. Workflow auto-promote result + the `trigger_steps_json` shape it captured
6. Labels.jsonl new entries
7. Operator-promoted-to-KB IOCs (count + list)
8. Sprint 1 GO/NO-GO decision based on the postmortem

If fire drill passes → cut `jetski-sync v3.1` tag; Sprint 1 code implementation kicks off immediately on darkseed side (start with migration 005 + verdict_engine.py v0.1).

---

## Appendix — Quick reference table for fire drill operator

| When | What | Who | Where |
|---|---|---|---|
| T+0 | Pre-flight checklists | both | local |
| T+0:10 | Agent A regenerates v1.2 artifacts; pushes to device + state.A_complete + adb kill-server | A | Mac |
| T+0:10:30 | Cable unplugged from Mac | operator | physical |
| T+0:11 | Cable plugged into Kali; `adb start-server` | operator + B | physical |
| T+0:11:30 | `dyn-playbook-scout` detects + claims `state.B_started` | B | Kali |
| T+0:12 | Pull, sanitize, mock_network, install | B | Kali |
| T+0:18 | Spawn × 3 VPN exits (35s each + setup) | B | Kali |
| T+0:32 | Evasion analysis + verdict engine | B | Kali |
| T+0:34 | Publisher writes joint MD + blobs | B | Kali |
| T+0:34:30 | darkseed ingests | darkseed | Kali |
| T+0:35 | `state.B_complete` + `adb kill-server` (symmetric) | B + operator | Kali |
| T+0:35:30 | Cable to Mac | operator | physical |
| T+0:36 | Mac picks up; operator opens Proofs tab | A | Mac |
| T+0:41 | Operator verdict click → mirrors to darkseed | A | Mac → Kali |
| T+0:41:30 | Workflows auto-promote + labels write + state.A_ack | both | both |
| T+0:42 | DONE | | |

Total: ~42 minutes wall-clock. Real-world allowance: 60 min for first run (cable fiddling, debugger pauses, screenshot capture latency).

---

*End of fire drill spec. Awaiting Agent A's `12_*.md` push with the three blocking artifacts; ready to execute the run the moment they land.*

— Agent B / darkseed planning
