CREATE TABLE "page_media" (
	"store_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "page_media_page_id_media_id_pk" PRIMARY KEY("page_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"title" text NOT NULL,
	"handle" text NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "pages_store_handle" UNIQUE("store_id","handle")
);
--> statement-breakpoint
ALTER TABLE "page_media" ADD CONSTRAINT "page_media_page" FOREIGN KEY ("store_id","page_id") REFERENCES "public"."pages"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_media_media" ON "page_media" USING btree ("store_id","media_id");--> statement-breakpoint
CREATE INDEX "pages_store_updated" ON "pages" USING btree ("store_id","updated_at");