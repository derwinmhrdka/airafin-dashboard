CREATE TABLE IF NOT EXISTS "transfer_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "period" text NOT NULL,
  "target_kind" text NOT NULL,
  "target_id" integer NOT NULL,
  "parent_id" integer,
  "pic" text NOT NULL,
  "body" text NOT NULL,
  "created_at" text NOT NULL,
  CONSTRAINT "transfer_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "transfer_comments_target_idx" ON "transfer_comments" ("project_id", "target_kind", "target_id");

CREATE TABLE IF NOT EXISTS "transfer_approvals" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "target_kind" text NOT NULL,
  "target_id" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  CONSTRAINT "transfer_approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "transfer_approvals_target_idx" ON "transfer_approvals" ("project_id", "target_kind", "target_id");
