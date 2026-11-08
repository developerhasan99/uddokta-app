CREATE TABLE "shipping_rate_products" (
	"store_id" uuid NOT NULL,
	"rate_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "shipping_rate_products_rate_id_product_id_pk" PRIMARY KEY("rate_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "shipping_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"free_over" integer,
	"free_min_qty" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_rates_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "shipping_rates_name" CHECK (char_length(btrim("shipping_rates"."name")) between 1 and 60 and char_length("shipping_rates"."note") <= 120),
	CONSTRAINT "shipping_rates_amounts" CHECK ("shipping_rates"."price" between 0 and 100000 and "shipping_rates"."free_over" between 1 and 10000000 and "shipping_rates"."free_min_qty" between 2 and 1000)
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_area";--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "stores_delivery";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "area" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "delivery_inside" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "delivery_inside" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "delivery_outside" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "delivery_outside" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_rate_products" ADD CONSTRAINT "shipping_rate_products_rate" FOREIGN KEY ("store_id","rate_id") REFERENCES "public"."shipping_rates"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rate_products" ADD CONSTRAINT "shipping_rate_products_product" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipping_rates_store_position" ON "shipping_rates" USING btree ("store_id","position");