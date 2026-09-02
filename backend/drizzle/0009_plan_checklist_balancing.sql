ALTER TABLE "plan_checklist" ALTER COLUMN "category_id" DROP NOT NULL;
ALTER TABLE "plan_checklist" ADD COLUMN IF NOT EXISTS "is_balancing" boolean NOT NULL DEFAULT false;
