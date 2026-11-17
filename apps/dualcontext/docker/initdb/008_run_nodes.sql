-- Runs on every start; every statement is idempotent.
-- Per-node detail of a run's graph (RunNodeDetail in the domain package): model calls with the prompts actually sent,
-- routing / researcher pairs / provided contexts of a context item. Kept out of augment_runs so the run row (and its SSE
-- broadcast) stays small; the run view reads one node when it is selected. Keys follow runNodeKey (classic, analyze, item:<id>, ...).
-- Deleting a run deletes its nodes.
CREATE TABLE IF NOT EXISTS augment_run_nodes (
  run_id     integer NOT NULL REFERENCES augment_runs(id) ON DELETE CASCADE,
  key        text NOT NULL,
  detail     jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, key)
);
