CREATE TABLE IF NOT EXISTS "pics" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE
);

INSERT INTO "pics" ("name")
VALUES
  ('Derwin'),
  ('Anggita')
ON CONFLICT ("name") DO NOTHING;
