CREATE TABLE IF NOT EXISTS "auth_emails" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "pic" text NOT NULL,
  CONSTRAINT "auth_emails_email_unique" UNIQUE("email")
);
