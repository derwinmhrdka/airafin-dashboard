CREATE TABLE "budget_subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"period" text NOT NULL,
	"name" text NOT NULL,
	"pic" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_subcategories" ADD CONSTRAINT "budget_subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "budget_subcategories_category_period_name_idx" ON "budget_subcategories" USING btree ("category_id","period","name");
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "sub_category" text DEFAULT '' NOT NULL;
