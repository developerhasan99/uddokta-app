CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal" integer DEFAULT 0 NOT NULL,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_store_code" UNIQUE("store_id","code"),
	CONSTRAINT "discounts_kind" CHECK ("discounts"."kind" in ('percent', 'amount')),
	CONSTRAINT "discounts_code" CHECK ("discounts"."code" ~ '^[A-Z0-9]{2,30}$'),
	CONSTRAINT "discounts_value" CHECK ("discounts"."value" > 0 and ("discounts"."kind" = 'amount' or "discounts"."value" <= 100) and "discounts"."min_subtotal" >= 0 and ("discounts"."max_uses" is null or "discounts"."max_uses" > 0) and "discounts"."uses" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts" CHECK ("orders"."subtotal" >= 0 and "orders"."delivery_charge" >= 0 and "orders"."discount" >= 0 and "orders"."discount" <= "orders"."subtotal" and "orders"."total" = "orders"."subtotal" + "orders"."delivery_charge" - "orders"."discount");