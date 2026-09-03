ALTER TABLE "auth_emails" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_project_email_idx" ON "project_members" USING btree ("project_id","email");
--> statement-breakpoint
-- Backfill: every existing auth email can access every existing project.
INSERT INTO "project_members" ("project_id", "email")
SELECT p."id", a."email"
FROM "projects" p
CROSS JOIN "auth_emails" a
ON CONFLICT DO NOTHING;
