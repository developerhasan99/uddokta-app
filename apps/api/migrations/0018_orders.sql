CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_name" text NOT NULL,
	"variant_label" text NOT NULL,
	"price" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "order_items_amounts" CHECK ("order_items"."price" >= 0 and "order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"area" text NOT NULL,
	"subtotal" integer NOT NULL,
	"delivery_charge" integer NOT NULL,
	"total" integer NOT NULL,
	"source" text NOT NULL,
	"page_id" uuid,
	"warehouse_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_store_number" UNIQUE("store_id","number"),
	CONSTRAINT "orders_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "orders_status" CHECK ("orders"."status" in ('new', 'hold', 'confirmed', 'packed', 'courier', 'delivered', 'returned', 'cancelled')),
	CONSTRAINT "orders_area" CHECK ("orders"."area" in ('inside', 'outside')),
	CONSTRAINT "orders_amounts" CHECK ("orders"."subtotal" >= 0 and "orders"."delivery_charge" >= 0 and "orders"."total" = "orders"."subtotal" + "orders"."delivery_charge")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_store_created" ON "orders" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_phone" ON "orders" USING btree ("store_id","phone");