-- darkseed core schema (Phase 1)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chains (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  family TEXT NOT NULL,
  source TEXT NOT NULL,
  seed_ioc_type TEXT NOT NULL,
  seed_ioc_value TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  severity TEXT NOT NULL,
  severity_score INTEGER NOT NULL,
  summary TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'accepted', -- accepted | proposed | archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_kind TEXT NOT NULL DEFAULT 'agent',
  created_by_id TEXT NOT NULL DEFAULT 'generator'
);
CREATE INDEX IF NOT EXISTS idx_chains_category ON chains(category);
CREATE INDEX IF NOT EXISTS idx_chains_severity ON chains(severity);
CREATE INDEX IF NOT EXISTS idx_chains_family ON chains(family);

CREATE TABLE IF NOT EXISTS chain_nodes (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  technique_id TEXT NOT NULL,
  technique_name TEXT NOT NULL,
  tactic TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  static_agent_note TEXT,
  dynamic_agent_note TEXT,
  status TEXT NOT NULL DEFAULT 'accepted', -- proposed | accepted | refuted
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_kind TEXT NOT NULL DEFAULT 'agent',
  created_by_id TEXT NOT NULL DEFAULT 'generator'
);
CREATE INDEX IF NOT EXISTS idx_nodes_chain ON chain_nodes(chain_id);
CREATE INDEX IF NOT EXISTS idx_nodes_technique ON chain_nodes(technique_id);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON chain_nodes(status);

CREATE TABLE IF NOT EXISTS chain_edges (
  chain_id TEXT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  label TEXT,
  PRIMARY KEY (chain_id, from_node, to_node)
);
CREATE INDEX IF NOT EXISTS idx_edges_chain ON chain_edges(chain_id);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES chain_nodes(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'static' | 'dynamic'
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  blob_sha256 TEXT,
  blob_mime TEXT,
  blob_size INTEGER,
  blob_filename TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  payload_json TEXT, -- structured payload (per-kind schema)
  timestamp_ms INTEGER,
  verification_status TEXT, -- pending | confirmed | refuted | inconclusive
  verification_method TEXT,
  verification_by TEXT,
  verification_at TEXT,
  status TEXT NOT NULL DEFAULT 'accepted', -- proposed | accepted | refuted
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_kind TEXT NOT NULL DEFAULT 'agent',
  created_by_id TEXT NOT NULL DEFAULT 'generator'
);
CREATE INDEX IF NOT EXISTS idx_evidence_node ON evidence(node_id);
CREATE INDEX IF NOT EXISTS idx_evidence_kind ON evidence(kind);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence(status);
CREATE INDEX IF NOT EXISTS idx_evidence_blob ON evidence(blob_sha256);

CREATE TABLE IF NOT EXISTS iocs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL REFERENCES chain_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT
);
CREATE INDEX IF NOT EXISTS idx_iocs_node ON iocs(node_id);
CREATE INDEX IF NOT EXISTS idx_iocs_value ON iocs(value);
CREATE INDEX IF NOT EXISTS idx_iocs_type_value ON iocs(type, value);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL REFERENCES chain_nodes(id) ON DELETE CASCADE,
  body_md TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_node ON comments(node_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL, -- 'chain' | 'node' | 'evidence' | 'edge' | 'comment'
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'created' | 'updated' | 'deleted' | 'proposed' | 'accepted' | 'rejected' | 'verified'
  actor_kind TEXT NOT NULL, -- 'user' | 'agent'
  actor_id TEXT NOT NULL,
  diff_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS blobs (
  sha256 TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  mime TEXT,
  filename TEXT,
  ref_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Phase 4 — agent learning loop
CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL, -- 'node' | 'evidence'
  entity_id TEXT NOT NULL,
  signal TEXT NOT NULL, -- 'approved' | 'rejected' | 'edited' | 'verified' | 'refuted'
  before_json TEXT,
  after_json TEXT,
  source_agent_kind TEXT,
  source_agent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_labels_entity ON labels(entity_type, entity_id);

-- Lightweight TF-IDF index for cross-chain similarity (Phase 4)
CREATE TABLE IF NOT EXISTS node_terms (
  node_id TEXT NOT NULL REFERENCES chain_nodes(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  tf REAL NOT NULL,
  PRIMARY KEY (node_id, term)
);
CREATE INDEX IF NOT EXISTS idx_node_terms_term ON node_terms(term);

CREATE TABLE IF NOT EXISTS term_df (
  term TEXT PRIMARY KEY,
  df INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS corpus_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Full-text search over chain summary/family/seed for the dashboard list
CREATE VIRTUAL TABLE IF NOT EXISTS chains_fts USING fts5(
  id UNINDEXED,
  family,
  summary,
  tags,
  seed_ioc_value,
  content=''
);
