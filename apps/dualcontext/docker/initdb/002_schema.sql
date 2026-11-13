-- Runs on every start; every statement is idempotent.
-- Researcher: one per source. Its documents are the raw material it collects.
CREATE TABLE IF NOT EXISTS researchers (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  keywords    text[] NOT NULL DEFAULT '{}',
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Procedure: the librarian's human-written analysis criteria, bound to a researcher.
CREATE TABLE IF NOT EXISTS procedures (
  id            serial PRIMARY KEY,
  researcher_id integer NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
  name          text NOT NULL,
  applies_when  text[] NOT NULL DEFAULT '{}',
  steps         text[] NOT NULL DEFAULT '{}',
  impacts       text[] NOT NULL DEFAULT '{}',
  output_format text NOT NULL DEFAULT '',
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (researcher_id, name)
);

CREATE TABLE IF NOT EXISTS documents (
  id            serial PRIMARY KEY,
  researcher_id integer NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
  title         text NOT NULL,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_korean_fts
  ON documents USING gin (to_tsvector('korean', title || ' ' || body));
