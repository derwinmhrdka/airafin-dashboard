ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "pocket" text NOT NULL DEFAULT '';
ALTER TABLE "budget_subcategories" ADD COLUMN IF NOT EXISTS "pocket" text NOT NULL DEFAULT '';
