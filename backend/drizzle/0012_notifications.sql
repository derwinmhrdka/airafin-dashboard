CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "to_pic" text NOT NULL,
  "from_pic" text NOT NULL,
  "type" text NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "period" text NOT NULL,
  "ref_key" text NOT NULL,
  "read_at" text,
  "resolved_at" text,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_ref_key_idx" ON "notifications" USING btree ("ref_key");
