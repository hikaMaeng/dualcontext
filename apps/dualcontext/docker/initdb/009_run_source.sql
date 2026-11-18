-- Runs on every start; every statement is idempotent.
-- Where a run came from: 'test' = admin site test run, 'mcp' = a call to the MCP tool. Old rows are test runs.
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'test';
-- The effort step a MCP call asked for (light|middle|high|xhigh); null for test runs and old rows.
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS effort text;
