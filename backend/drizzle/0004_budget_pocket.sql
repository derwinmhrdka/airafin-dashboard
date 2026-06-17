ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "pocket" text DEFAULT '' NOT NULL;
ALTER TABLE "budget_subcategories" ADD COLUMN IF NOT EXISTS "pocket" text DEFAULT '' NOT NULL;
