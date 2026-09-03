CREATE TABLE IF NOT EXISTS "info_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "info_update_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"info_update_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"photo" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "info_update_skips" (
	"id" serial PRIMARY KEY NOT NULL,
	"info_update_id" integer NOT NULL,
	"email" text NOT NULL,
	"skipped_at" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "info_update_pages" ADD CONSTRAINT "info_update_pages_info_update_id_info_updates_id_fk" FOREIGN KEY ("info_update_id") REFERENCES "public"."info_updates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "info_update_skips" ADD CONSTRAINT "info_update_skips_info_update_id_info_updates_id_fk" FOREIGN KEY ("info_update_id") REFERENCES "public"."info_updates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "info_update_skips_update_email_idx" ON "info_update_skips" USING btree ("info_update_id","email");
