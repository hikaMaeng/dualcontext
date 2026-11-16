-- Runs on every start; every statement is idempotent.
-- Run-log list: filter by chosen researcher / procedure, keyword (Korean FTS) and semantic (embedding) search.
-- These columns are denormalized from pairs / query / answers / context so the list can filter, rank and page in SQL.

-- Names of the chosen researchers / procedures (from pairs, de-duplicated, selection order kept, null procedure left out).
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS researcher_names text[] NOT NULL DEFAULT '{}';
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS procedure_names text[] NOT NULL DEFAULT '{}';
-- Full-text document: query (A) + final answers (B) + context (C), parsed with the Korean text search config.
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS search_tsv tsvector;
-- Query embedding, a plain array tagged with the embedding model name that made it (same approach as crawl_chunks).
-- No pgvector column: the table is capped at 500 rows and a model change must not lock the dimension.
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS query_embedding double precision[];
ALTER TABLE augment_runs ADD COLUMN IF NOT EXISTS embedding_key text;

-- One definition of the derived columns, kept current by a trigger so every writer (server, MCP process, backfill) agrees.
-- It fires only when the source columns are named in an UPDATE, so the final status/stage/duration update costs nothing.
-- Each text is cut to 200000 chars: a tsvector is limited to 1 MB and a very long context would make the statement fail.
CREATE OR REPLACE FUNCTION augment_runs_derive() RETURNS trigger AS $$
BEGIN
  IF jsonb_typeof(NEW.pairs) = 'array' THEN
    NEW.researcher_names := coalesce((
      SELECT array_agg(name ORDER BY first_at)
        FROM (SELECT e ->> 'researcher' AS name, min(ord) AS first_at
                FROM jsonb_array_elements(NEW.pairs) WITH ORDINALITY AS t(e, ord)
               WHERE e ->> 'researcher' IS NOT NULL GROUP BY 1) AS s
    ), '{}');
    NEW.procedure_names := coalesce((
      SELECT array_agg(name ORDER BY first_at)
        FROM (SELECT e ->> 'procedure' AS name, min(ord) AS first_at
                FROM jsonb_array_elements(NEW.pairs) WITH ORDINALITY AS t(e, ord)
               WHERE e ->> 'procedure' IS NOT NULL GROUP BY 1) AS s
    ), '{}');
  ELSE
    NEW.researcher_names := '{}';
    NEW.procedure_names := '{}';
  END IF;
  NEW.search_tsv :=
    setweight(to_tsvector('korean', left(coalesce(NEW.query, ''), 200000)), 'A')
    || setweight(to_tsvector('korean', left(coalesce(NEW.answers #>> '{after,text}', ''), 200000)), 'B')
    || setweight(to_tsvector('korean', left(coalesce(NEW.answers #>> '{before,text}', ''), 200000)), 'B')
    || setweight(to_tsvector('korean', left(coalesce(NEW.context, ''), 200000)), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS augment_runs_derive ON augment_runs;
CREATE TRIGGER augment_runs_derive
  BEFORE INSERT OR UPDATE OF query, pairs, context, answers ON augment_runs
  FOR EACH ROW EXECUTE FUNCTION augment_runs_derive();

-- Backfill old rows through the same trigger (naming query in SET fires it). Rows done once have a non-null search_tsv.
UPDATE augment_runs SET query = query WHERE search_tsv IS NULL;

CREATE INDEX IF NOT EXISTS augment_runs_researcher_names ON augment_runs USING gin (researcher_names);
CREATE INDEX IF NOT EXISTS augment_runs_procedure_names ON augment_runs USING gin (procedure_names);
CREATE INDEX IF NOT EXISTS augment_runs_search_tsv ON augment_runs USING gin (search_tsv);
