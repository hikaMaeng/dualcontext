-- Runs on every start; every statement is idempotent.
-- Where a run came from: 'test' = admin site test run, 'mcp' = a call to the MCP tool. Old rows are test runs.
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'test';
