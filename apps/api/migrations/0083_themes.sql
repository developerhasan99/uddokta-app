CREATE TABLE "theme_media" (
	"store_id" uuid NOT NULL,
	"theme_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "theme_media_theme_id_media_id_pk" PRIMARY KEY("theme_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"revision" integer DEFAULT 1 NOT NULL,
	"starter" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "themes_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "themes_name" CHECK (char_length(btrim("themes"."name")) between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "live_theme_id" uuid;--> statement-breakpoint
ALTER TABLE "theme_media" ADD CONSTRAINT "theme_media_theme" FOREIGN KEY ("store_id","theme_id") REFERENCES "public"."themes"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "theme_media_media" ON "theme_media" USING btree ("store_id","media_id");--> statement-breakpoint
CREATE INDEX "themes_store_updated" ON "themes" USING btree ("store_id","updated_at");