CREATE TABLE IF NOT EXISTS "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"photo" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
INSERT INTO "projects" ("name", "photo", "created_at")
SELECT 'Mahardiora Home', NULL, now()::text
WHERE NOT EXISTS (SELECT 1 FROM "projects" WHERE "name" = 'Mahardiora Home');
--> statement-breakpoint
ALTER TABLE "incomes" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
ALTER TABLE "budget_subcategories" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
ALTER TABLE "plan_checklist" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
UPDATE "incomes" SET "project_id" = (SELECT "id" FROM "projects" ORDER BY "id" ASC LIMIT 1) WHERE "project_id" IS NULL;
--> statement-breakpoint
UPDATE "budgets" SET "project_id" = (SELECT "id" FROM "projects" ORDER BY "id" ASC LIMIT 1) WHERE "project_id" IS NULL;
--> statement-breakpoint
UPDATE "budget_subcategories" SET "project_id" = (SELECT "id" FROM "projects" ORDER BY "id" ASC LIMIT 1) WHERE "project_id" IS NULL;
--> statement-breakpoint
UPDATE "transactions" SET "project_id" = (SELECT "id" FROM "projects" ORDER BY "id" ASC LIMIT 1) WHERE "project_id" IS NULL;
--> statement-breakpoint
UPDATE "plan_checklist" SET "project_id" = (SELECT "id" FROM "projects" ORDER BY "id" ASC LIMIT 1) WHERE "project_id" IS NULL;
--> statement-breakpoint
UPDATE "notifications" SET "project_id" = (SELECT "id" FROM "projects" ORDER BY "id" ASC LIMIT 1) WHERE "project_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "incomes" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "budget_subcategories" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "plan_checklist" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incomes" ADD CONSTRAINT "incomes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budgets" ADD CONSTRAINT "budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_subcategories" ADD CONSTRAINT "budget_subcategories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_checklist" ADD CONSTRAINT "plan_checklist_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "incomes_source_period_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "budgets_category_period_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "budget_subcategories_category_period_name_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "notifications_ref_key_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "incomes_project_source_period_idx" ON "incomes" USING btree ("project_id","source","period");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_project_category_period_idx" ON "budgets" USING btree ("project_id","category_id","period");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budget_subcategories_project_cat_period_name_idx" ON "budget_subcategories" USING btree ("project_id","category_id","period","name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_project_ref_key_idx" ON "notifications" USING btree ("project_id","ref_key");
--> statement-breakpoint
-- Rewrite legacy notification ref keys to include project id (avoids duplicate dues on first sync).
UPDATE "notifications"
SET "ref_key" = 'pay_due:' || "project_id"::text || ':' || substring("ref_key" from length('pay_due:') + 1)
WHERE "type" = 'pay_due'
  AND "ref_key" LIKE 'pay_due:%'
  AND "ref_key" NOT LIKE 'pay_due:' || "project_id"::text || ':%';
--> statement-breakpoint
UPDATE "notifications"
SET "ref_key" = 'paid_received:pay_due:' || "project_id"::text || ':' || substring("ref_key" from length('paid_received:pay_due:') + 1)
WHERE "type" = 'paid_received'
  AND "ref_key" LIKE 'paid_received:pay_due:%'
  AND "ref_key" NOT LIKE 'paid_received:pay_due:' || "project_id"::text || ':%';
