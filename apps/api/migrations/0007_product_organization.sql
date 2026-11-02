ALTER TABLE "products" DROP CONSTRAINT "products_status";--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "media_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_status" CHECK ("products"."status" in ('draft', 'active', 'unlisted'));