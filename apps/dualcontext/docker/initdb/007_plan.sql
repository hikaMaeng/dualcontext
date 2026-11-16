-- Runs on every start; every statement is idempotent.
-- Context planner (decompose / reevaluate modes): one settings document, see ContextPlanConfig in the domain package.
-- Single row (id = 1). The default row is inserted by the server at start (src/server/plan/config), not here,
-- so the long Korean prompts stay in code; an existing row is never overwritten.
CREATE TABLE IF NOT EXISTS plan_config (
  id         integer PRIMARY KEY CHECK (id = 1),
  config     jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Planner trace of a run (PlanTrace in the domain package): items, dependency levels, build waves, reevaluation rounds.
-- NULL for classic runs and for runs from before the planner.
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS plan jsonb;
-- Planner progress while a run is still going: {stage, detail, at}. The trace itself is only known at the end,
-- so this is what the run detail shows in the meantime (the planner's progress events carry no partial trace).
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS plan_progress jsonb;
