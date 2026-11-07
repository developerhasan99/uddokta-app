ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_amounts";--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "barcode" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "low_stock" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_codes" CHECK (length("product_variants"."sku") <= 100 and length("product_variants"."barcode") <= 100);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_amounts" CHECK ("product_variants"."price" >= 0 and "product_variants"."compare_price" >= 0 and "product_variants"."stock" >= 0 and "product_variants"."low_stock" >= 0);