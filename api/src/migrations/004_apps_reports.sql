-- Phase 8: apps + reports — one row per APK; N reports per APK; N APKs per artifact.

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,                  -- = apk_sha256 (canonical)
  artifact_id TEXT,                     -- stable across versions (typically package_name)
  package_name TEXT,
  version_name TEXT,
  version_code INTEGER,
  apk_sha256 TEXT UNIQUE,
  apk_blob_sha TEXT,                    -- ref → blobs.sha256 (optional, NULL if APK not retained)
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT                           -- 'report' | 'device' | 'manual'
);
CREATE INDEX IF NOT EXISTS idx_apps_artifact ON apps(artifact_id);
CREATE INDEX IF NOT EXISTS idx_apps_package ON apps(package_name);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  app_id TEXT REFERENCES apps(id),                  -- NULLABLE: standalone report without APK
  source_path TEXT,
  filename TEXT,
  body_blob_sha TEXT NOT NULL,                       -- immutable .md body in blob store
  content_hash TEXT NOT NULL,                        -- sha256 of body for idempotent re-ingest
  declared_category TEXT,                            -- riskware | toll_fraud | phishing | NULL
  declared_label TEXT,                               -- tp | fp | NULL
  effective_label TEXT,                              -- post-review override
  flipped INTEGER NOT NULL DEFAULT 0,                -- 1 when effective != declared
  status TEXT NOT NULL DEFAULT 'pending',            -- pending | processing | ingested | rejected
  ingested_chain_id TEXT REFERENCES chains(id),
  frontmatter_json TEXT,                             -- raw parsed YAML for reference
  tags_json TEXT NOT NULL DEFAULT '[]',
  first_seen_iso TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  reviewed_at TEXT,
  reviewed_by_kind TEXT,
  reviewed_by_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_app ON reports(app_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_flipped ON reports(flipped);
CREATE INDEX IF NOT EXISTS idx_reports_chain ON reports(ingested_chain_id);
CREATE INDEX IF NOT EXISTS idx_reports_content ON reports(content_hash);

-- A chain can be backlinked to the app it analyzes (set when chain is
-- produced from a report or from a future device job).
ALTER TABLE chains ADD COLUMN app_id TEXT;
ALTER TABLE chains ADD COLUMN source_report_id TEXT;
CREATE INDEX IF NOT EXISTS idx_chains_app ON chains(app_id);
