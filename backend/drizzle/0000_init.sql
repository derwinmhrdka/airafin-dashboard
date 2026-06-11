CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"period" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"allocated_amount" numeric(14, 2) NOT NULL,
	"period" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"category_id" integer NOT NULL,
	"detail" text NOT NULL,
	"cost" numeric(14, 2) NOT NULL,
	"period" text NOT NULL,
	"pic" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "incomes_source_period_idx" ON "incomes" USING btree ("source","period");
--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_category_period_idx" ON "budgets" USING btree ("category_id","period");
