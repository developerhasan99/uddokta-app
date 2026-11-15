CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menus_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "menus_store_handle" UNIQUE("store_id","handle"),
	CONSTRAINT "menus_title" CHECK (char_length(btrim("menus"."title")) between 1 and 60 and "menus"."handle" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("menus"."handle") <= 60),
	CONSTRAINT "menus_items" CHECK (jsonb_typeof("menus"."items") = 'array')
);
--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;