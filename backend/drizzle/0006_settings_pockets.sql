CREATE TABLE IF NOT EXISTS "pockets" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE
);

INSERT INTO "pockets" ("name")
VALUES
  ('BCA'),
  ('MANDIRI'),
  ('SUPA'),
  ('DANA'),
  ('OVO'),
  ('CASH'),
  ('BIBIT')
ON CONFLICT ("name") DO NOTHING;
