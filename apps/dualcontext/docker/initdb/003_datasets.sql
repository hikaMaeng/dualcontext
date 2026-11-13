-- Empty preset tables for the table-type (pgvector) researchers. They are filled by
-- apps/dualcontext/seed-data/load-datasets.mjs. Same shape for every table:
--   title/body        for display
--   embedding         full dimension (768, the configured embedding model's output size)
--   embedding_mrl     Matryoshka-reduced dimension (256): the first 256 values of the
--                     full vector, re-normalized. Kept as its own field.
-- The HNSW index is on the reduced field only. Search finds candidates with it and
-- re-ranks them with the full field. A model with other sizes needs a re-embed.
CREATE TABLE IF NOT EXISTS ds_legal_terms    (id serial PRIMARY KEY, source_id text, title text NOT NULL, body text NOT NULL, embedding vector(768), embedding_mrl vector(256));
CREATE TABLE IF NOT EXISTS ds_legal_cases    (id serial PRIMARY KEY, source_id text, title text NOT NULL, body text NOT NULL, embedding vector(768), embedding_mrl vector(256));
CREATE TABLE IF NOT EXISTS ds_medical_exam   (id serial PRIMARY KEY, source_id text, title text NOT NULL, body text NOT NULL, embedding vector(768), embedding_mrl vector(256));
CREATE TABLE IF NOT EXISTS ds_industry_news  (id serial PRIMARY KEY, source_id text, title text NOT NULL, body text NOT NULL, embedding vector(768), embedding_mrl vector(256));
CREATE TABLE IF NOT EXISTS ds_finance_reports(id serial PRIMARY KEY, source_id text, title text NOT NULL, body text NOT NULL, embedding vector(768), embedding_mrl vector(256));

CREATE INDEX IF NOT EXISTS ds_legal_terms_mrl     ON ds_legal_terms     USING hnsw (embedding_mrl vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ds_legal_cases_mrl     ON ds_legal_cases     USING hnsw (embedding_mrl vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ds_medical_exam_mrl    ON ds_medical_exam    USING hnsw (embedding_mrl vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ds_industry_news_mrl   ON ds_industry_news   USING hnsw (embedding_mrl vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ds_finance_reports_mrl ON ds_finance_reports USING hnsw (embedding_mrl vector_cosine_ops);
