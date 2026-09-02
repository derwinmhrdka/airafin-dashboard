CREATE TABLE IF NOT EXISTS "plan_checklist" (
  "id" serial PRIMARY KEY NOT NULL,
  "period" text NOT NULL,
  "category_id" integer NOT NULL REFERENCES "categories"("id"),
  "subcategory_name" text NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "sender_pic" text NOT NULL,
  "receiver_pic" text NOT NULL,
  "pocket" text NOT NULL DEFAULT '',
  "done" boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "plan_checklist_period_idx" ON "plan_checklist" ("period");
