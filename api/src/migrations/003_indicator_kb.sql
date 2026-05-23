-- Phase 7: indicator knowledge base — two pools (benign + malicious) of typed
-- indicators that the worker agents consult during analysis.

CREATE TABLE IF NOT EXISTS indicators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,           -- package | domain | ip | sha256 | md5 | cert | ja3 | elf | url | phone | email
  value TEXT NOT NULL,
  polarity TEXT NOT NULL,       -- benign | malicious
  category TEXT,                -- riskware | toll_fraud | phishing | infra | sdk | NULL
  confidence REAL DEFAULT 1.0,  -- 0..1
  source TEXT,                  -- 'seed' | 'manual' | 'promoted:<chain_id>' | 'feed:<name>'
  notes_md TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_kind TEXT NOT NULL DEFAULT 'user',
  created_by_id TEXT NOT NULL DEFAULT 'system',
  UNIQUE(type, value, polarity)
);
CREATE INDEX IF NOT EXISTS idx_indicators_type_value ON indicators(type, value);
CREATE INDEX IF NOT EXISTS idx_indicators_polarity ON indicators(polarity);
CREATE INDEX IF NOT EXISTS idx_indicators_category ON indicators(category);

-- Track polarity changes (re-classification audit)
CREATE TABLE IF NOT EXISTS indicator_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator_id INTEGER NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  prev_polarity TEXT,
  new_polarity TEXT NOT NULL,
  reason TEXT,
  changed_by_kind TEXT NOT NULL,
  changed_by_id TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
