# Synthetic Attack Chain Node Graph Pool — Schema

This package contains 1,000 synthetic defensive attack-chain graphs for riskware, toll fraud, and phishing analysis.

## Files

- `synthetic_attack_chain_graphs_1000.json` — JSON array containing all graphs.
- `synthetic_attack_chain_graphs_1000.jsonl` — one graph per line, useful for streaming pipelines.
- `attack_chain_graph_summary.csv` — high-level dataset counts.
- `attack_chain_graph_schema.md` — this schema.

## Safety Model

The dataset is synthetic and defensive. It uses placeholder indicators such as `.example.invalid` domains and non-live package names. It is designed for triage, detection planning, graph visualization, agent evaluation, and reporting workflows. It does not contain exploit code, live infrastructure, credential targets, or instructions for committing abuse.

## Top-Level Graph Object

```json
{
  "graph_id": "ACG-0001",
  "dataset": "synthetic_defensive_attack_chain_pool_v1",
  "generated_at": "ISO-8601 UTC timestamp",
  "attack_type": "riskware | toll_fraud | phishing",
  "family_hint": "abstract family/category hint",
  "risk_score": 0,
  "risk_band": "low | medium | high | critical",
  "is_synthetic": true,
  "safety_note": "placeholder IOC warning",
  "summary": "short graph summary",
  "synthetic_indicators": {
    "domains": ["placeholder.example.invalid"],
    "package_name": "com.synthetic...",
    "campaign_id": "camp-...",
    "sample_sha256_placeholder": "64-char placeholder hash"
  },
  "graph": {
    "nodes": [],
    "edges": []
  },
  "triage": {
    "first_questions": [],
    "minimum_evidence_to_escalate": []
  }
}
```

## Node Object

```json
{
  "id": "n1",
  "label": "observable or response label",
  "phase": "delivery | installation | execution | permission_or_trust_request | configuration_or_infrastructure | collection_or_capture | monetization_or_abuse | evasion_or_persistence | detection_response",
  "node_type": "observable_behavior | defensive_action",
  "severity": 0,
  "confidence": 0.0,
  "evidence_signals": [],
  "analyst_questions": [],
  "recommended_controls": []
}
```

## Edge Object

```json
{
  "source": "n1",
  "target": "n2",
  "relation": "precedes | leads_to | supports | enables | increases_likelihood_of | reinforces | alternative_path | parallel_signal | triggers_response",
  "weight": 0.0
}
```

## Suggested Uses

- Feed into a node-link graph viewer.
- Test an analyst-agent's ability to summarize evidence and recommend controls.
- Generate Move Cards / triage cards for malware, riskware, toll fraud, and phishing review.
- Train evaluation prompts around confidence, evidence gaps, and escalation logic.
