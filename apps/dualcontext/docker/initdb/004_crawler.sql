-- Runs on every start; every statement is idempotent.
-- Crawler researcher cache. One crawl set per researcher; rows disappear with the researcher.
CREATE TABLE IF NOT EXISTS crawl_state (
  researcher_id integer PRIMARY KEY REFERENCES researchers(id) ON DELETE CASCADE,
  -- Fingerprint of what is crawled (start URLs, domains, depth, limits). A different value discards the cache.
  fingerprint   text NOT NULL,
  status        text NOT NULL DEFAULT 'idle',
  started_at    timestamptz,
  finished_at   timestamptz,
  pages         integer NOT NULL DEFAULT 0,
  chunks        integer NOT NULL DEFAULT 0,
  error         text
);

CREATE TABLE IF NOT EXISTS crawl_pages (
  researcher_id integer NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
  url           text NOT NULL,
  title         text NOT NULL DEFAULT '',
  content_hash  text NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (researcher_id, url)
);

-- embedding is a plain array tagged with the model that made it (embedding_key), so changing the embedding
-- model re-embeds lazily instead of locking the table to one dimension. The set is capped at 3000 chunks per researcher.
CREATE TABLE IF NOT EXISTS crawl_chunks (
  researcher_id integer NOT NULL,
  url           text NOT NULL,
  idx           integer NOT NULL,
  text          text NOT NULL,
  embedding     double precision[],
  embedding_key text,
  PRIMARY KEY (researcher_id, url, idx),
  FOREIGN KEY (researcher_id, url) REFERENCES crawl_pages(researcher_id, url) ON DELETE CASCADE
);
