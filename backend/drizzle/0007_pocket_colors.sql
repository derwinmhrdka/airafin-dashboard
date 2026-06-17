ALTER TABLE "pockets"
ADD COLUMN IF NOT EXISTS "color" text NOT NULL DEFAULT '#71717a';

UPDATE "pockets"
SET "color" = '#71717a'
WHERE "color" IS NULL OR trim("color") = '';
