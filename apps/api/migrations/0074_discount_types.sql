CREATE TABLE "discount_products" (
	"store_id" uuid NOT NULL,
	"discount_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "discount_products_discount_id_product_id_role_pk" PRIMARY KEY("discount_id","product_id","role"),
	CONSTRAINT "discount_products_role" CHECK ("discount_products"."role" in ('buy', 'get'))
);
--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT "discounts_code";--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT "discounts_value";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts";--> statement-breakpoint
ALTER TABLE "discounts" ALTER COLUMN "code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "type" text DEFAULT 'order' NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "min_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "once_per_phone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "applies_all" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "buys_all" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "buy_qty" integer;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "get_qty" integer;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "max_per_order" integer;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "starts_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_id" uuid;--> statement-breakpoint
-- Existing coupons started when they were made (and before they ended), so expired ones stay valid rows.
UPDATE "discounts" SET "starts_at" = least("created_at", coalesce("ends_at" - interval '1 second', "created_at"));--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_store_id" UNIQUE("store_id","id");--> statement-breakpoint
ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_discount" FOREIGN KEY ("store_id","discount_id") REFERENCES "public"."discounts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_product_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discount_products_product" ON "discount_products" USING btree ("store_id","product_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_type" CHECK ("discounts"."type" in ('order', 'products', 'bxgy', 'shipping'));--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_title" CHECK (char_length("discounts"."title") <= 100 and ("discounts"."code" is not null or "discounts"."title" <> ''));--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_bxgy" CHECK (case when "discounts"."type" = 'bxgy' then "discounts"."kind" = 'percent' and "discounts"."buy_qty" between 1 and 100 and "discounts"."get_qty" between 1 and 100 and ("discounts"."max_per_order" is null or "discounts"."max_per_order" between 1 and 100)
    else "discounts"."buy_qty" is null and "discounts"."get_qty" is null and "discounts"."max_per_order" is null end);--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_shipping" CHECK ("discounts"."type" <> 'shipping' or ("discounts"."kind" = 'percent' and "discounts"."value" = 100));--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_dates" CHECK ("discounts"."ends_at" is null or "discounts"."ends_at" > "discounts"."starts_at");--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_code" CHECK ("discounts"."code" is null or "discounts"."code" ~ '^[A-Z0-9]{2,30}$');--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_value" CHECK ("discounts"."value" > 0 and ("discounts"."kind" = 'amount' or "discounts"."value" <= 100) and "discounts"."min_subtotal" >= 0 and "discounts"."min_qty" >= 0 and ("discounts"."max_uses" is null or "discounts"."max_uses" > 0) and "discounts"."uses" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts" CHECK ("orders"."subtotal" >= 0 and "orders"."delivery_charge" >= 0 and "orders"."discount" >= 0 and "orders"."discount" <= "orders"."subtotal" + "orders"."delivery_charge" and "orders"."total" = "orders"."subtotal" + "orders"."delivery_charge" - "orders"."discount");