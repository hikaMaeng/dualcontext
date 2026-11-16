-- Runs on every start; every statement is idempotent.
-- Researcher default procedure: attached instead when procedure routing selects none. NULL = no default.
-- ON DELETE SET NULL: deleting the procedure clears the default (the link row is removed by its own CASCADE).
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS default_procedure_id integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'researchers_default_procedure_id_fkey') THEN
    ALTER TABLE researchers
      ADD CONSTRAINT researchers_default_procedure_id_fkey
      FOREIGN KEY (default_procedure_id) REFERENCES procedures(id) ON DELETE SET NULL;
  END IF;
END $$;
