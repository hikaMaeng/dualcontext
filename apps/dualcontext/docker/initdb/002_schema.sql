-- Runs on every start; every statement is idempotent.
-- Researcher (조사원): one per source. type + config say how it collects.
CREATE TABLE IF NOT EXISTS researchers (
  id            serial PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  description   text NOT NULL DEFAULT '',
  keywords      text[] NOT NULL DEFAULT '{}',
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'folder';
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';
-- Cached routing embedding. embedding_key = hash(model + text) so a changed
-- description or model is detected without a version column.
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS embedding double precision[];
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS embedding_key text;

-- Procedure: human-written analysis criteria. Independent of any researcher.
CREATE TABLE IF NOT EXISTS procedures (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  applies_when  text[] NOT NULL DEFAULT '{}',
  steps         text[] NOT NULL DEFAULT '{}',
  impacts       text[] NOT NULL DEFAULT '{}',
  output_format text NOT NULL DEFAULT '',
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS embedding double precision[];
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS embedding_key text;

-- Names are unique so presets are idempotent and the admin cannot create look-alikes.
CREATE UNIQUE INDEX IF NOT EXISTS procedures_name_key ON procedures (name);

-- Marks one-time seeding (e.g. presets) so deleted presets are not recreated on restart.
CREATE TABLE IF NOT EXISTS seed_state (name text PRIMARY KEY);

-- The link is owned by the researcher: which procedures it may use, in order.
CREATE TABLE IF NOT EXISTS researcher_procedures (
  researcher_id integer NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
  procedure_id  integer NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  position      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (researcher_id, procedure_id)
);

-- Migration from the first schema, where a procedure belonged to one researcher.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'procedures' AND column_name = 'researcher_id') THEN
    INSERT INTO researcher_procedures (researcher_id, procedure_id)
      SELECT researcher_id, id FROM procedures ON CONFLICT DO NOTHING;
    ALTER TABLE procedures DROP COLUMN researcher_id;
  END IF;
END $$;

-- 자료(documents) 는 더 이상 없다. 조사원이 출처를 직접 가리킨다.
DROP TABLE IF EXISTS documents;

-- Router: a single row. Stage 1 picks researchers, stage 2 picks their procedures.
-- Defaults are inserted by the server at start (see src/server/seed), not here.
CREATE TABLE IF NOT EXISTS router_config (
  id                  integer PRIMARY KEY CHECK (id = 1),
  researcher_method   text NOT NULL,
  researcher_top_k    integer NOT NULL,
  researcher_prompt   text NOT NULL,
  procedure_method    text NOT NULL,
  procedure_top_k     integer NOT NULL,
  procedure_prompt    text NOT NULL
);

-- Writer: how the final context is made. At most one is active.
CREATE TABLE IF NOT EXISTS writers (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  engine     text NOT NULL,
  mode       text NOT NULL,
  prompt     text NOT NULL DEFAULT '',
  active     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS writers_one_active ON writers (active) WHERE active;

-- Run log of the admin "try a query" page. settings is a snapshot of every knob
-- that shaped the result (router, writer, models), so a run can be understood later
-- even after those settings change. Bounded: the server keeps the latest 500 rows.
CREATE TABLE IF NOT EXISTS augment_runs (
  id                 serial PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  query              text NOT NULL,
  status             text NOT NULL,
  error              text,
  duration_ms        integer NOT NULL,
  researcher_routing text,
  settings           jsonb NOT NULL,
  pairs              jsonb NOT NULL DEFAULT '[]',
  context            text
);
CREATE INDEX IF NOT EXISTS augment_runs_created ON augment_runs (created_at DESC);

-- AI servers (OpenAI-compatible endpoints). Embedding and LLM are separate servers.
-- The api_key columns are write-only through the admin API (never returned);
-- when empty, DUALCONTEXT_LLM_API_KEY is used instead.
CREATE TABLE IF NOT EXISTS ai_server (
  id                 integer PRIMARY KEY CHECK (id = 1),
  embedding_base_url text NOT NULL,
  embedding_model    text NOT NULL DEFAULT '',
  embedding_api_key  text NOT NULL DEFAULT '',
  chat_base_url      text NOT NULL,
  chat_model         text NOT NULL DEFAULT '',
  chat_api_key       text NOT NULL DEFAULT ''
);
