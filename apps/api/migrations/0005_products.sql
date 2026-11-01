CREATE TABLE "product_media" (
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "product_media_product_id_media_id_pk" PRIMARY KEY("product_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "product_variant_costs" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"cost" integer NOT NULL,
	CONSTRAINT "product_variant_costs_amount" CHECK ("product_variant_costs"."cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"options" text[] NOT NULL,
	"position" integer NOT NULL,
	"price" integer NOT NULL,
	"compare_price" integer,
	"sku" text DEFAULT '' NOT NULL,
	"stock" integer,
	CONSTRAINT "product_variants_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "product_variants_amounts" CHECK ("product_variants"."price" >= 0 and "product_variants"."compare_price" >= 0 and "product_variants"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "products_status" CHECK ("products"."status" in ('draft', 'active'))
);
--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_costs" ADD CONSTRAINT "product_variant_costs_variant" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_media_media" ON "product_media" USING btree ("store_id","media_id");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "products_store_created" ON "products" USING btree ("store_id","created_at");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_store_id" UNIQUE("store_id","id");