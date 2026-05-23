# darkseed

A local threat-intel sandbox: 1000 synthetic attack chains (riskware, toll fraud, phishing)
seeded from public threat feeds (MalwareBazaar, URLhaus, OpenPhish), with synthetic
static + dynamic analysis evidence attached at every step in the chain.

```
darkseed/
├── generator/        # Node script: fetch feeds → build chains → write JSON
├── data/             # Generated output (1000 chains + index)
└── dashboard/        # Vite + React + React Flow viewer (pure static)
```

## Quick start

```bash
pnpm install                # install workspace deps
pnpm generate               # fetch feeds + build 1000 chains into data/
pnpm dev                    # copy data/ into dashboard/public/ and start Vite
```

Open http://localhost:5173.

## Data model

A `Chain` is a directed graph of `ChainNode`s. Each node represents one MITRE ATT&CK
technique observed (or simulated) at a step in the kill chain. Each node carries
`evidence.static[]` and `evidence.dynamic[]` arrays — the simulated outputs of a
static researcher agent (manifest dump, permissions, YARA, strings) and a dynamic
researcher agent (syscalls, network IOCs, behavior summary).

See `generator/src/types.ts` for the full schema.

## Categories

- **riskware** — Android riskware that abuses sensitive permissions (spyware,
  stalkerware-adjacent, aggressive adware).
- **toll_fraud** — Mobile billing fraud: premium SMS, WAP billing, carrier-billing
  abuse. Family examples: Joker, Harly, Vesub.
- **phishing** — Credential-harvesting kits and lures. Includes both web kits
  (from URLhaus/OpenPhish) and mobile phishing apps (FluBot-style).
