-- Phase 6: chain-level verdict + per-node/per-evidence feedback threads.
-- ALTER TABLE in SQLite cannot use IF NOT EXISTS, so this file must only run once.
-- The migration runner gates execution by schema_version.

ALTER TABLE chains ADD COLUMN verdict TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE chains ADD COLUMN verdict_source TEXT;        -- agent | reviewer | flipped
ALTER TABLE chains ADD COLUMN verdict_set_at TEXT;
ALTER TABLE chains ADD COLUMN verdict_set_by_kind TEXT;
ALTER TABLE chains ADD COLUMN verdict_set_by_id TEXT;
ALTER TABLE chains ADD COLUMN verdict_notes_md TEXT;
ALTER TABLE chains ADD COLUMN agent_initial_verdict TEXT; -- the agent's original call (immutable once set)
ALTER TABLE chains ADD COLUMN agent_confidence REAL;       -- 0..1

CREATE INDEX IF NOT EXISTS idx_chains_verdict ON chains(verdict);

CREATE TABLE IF NOT EXISTS node_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL REFERENCES chain_nodes(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,        -- agree | disagree | edit | note_only
  notes_md TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_node_feedback_node ON node_feedback(node_id);

CREATE TABLE IF NOT EXISTS evidence_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,        -- agree | disagree | edit | note_only
  notes_md TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_feedback_ev ON evidence_feedback(evidence_id);
