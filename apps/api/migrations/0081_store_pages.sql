CREATE TABLE "store_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"title" text NOT NULL,
	"handle" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"publish_at" timestamp with time zone,
	"policy" text,
	"template" text DEFAULT '' NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_pages_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "store_pages_store_handle" UNIQUE("store_id","handle"),
	CONSTRAINT "store_pages_text" CHECK (char_length(btrim("store_pages"."title")) between 1 and 200 and char_length("store_pages"."handle") between 1 and 100 and char_length("store_pages"."body") <= 100000 and char_length("store_pages"."template") <= 60 and char_length("store_pages"."seo_title") <= 300 and char_length("store_pages"."seo_description") <= 1000),
	CONSTRAINT "store_pages_policy" CHECK ("store_pages"."policy" in ('refund', 'privacy', 'shipping', 'terms', 'contact'))
);
--> statement-breakpoint
ALTER TABLE "store_pages" ADD CONSTRAINT "store_pages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "store_pages_store_policy" ON "store_pages" USING btree ("store_id","policy") WHERE "store_pages"."policy" is not null;--> statement-breakpoint
CREATE INDEX "store_pages_store_updated" ON "store_pages" USING btree ("store_id","updated_at");