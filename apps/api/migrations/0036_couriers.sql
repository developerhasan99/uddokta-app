CREATE TABLE "courier_accounts" (
	"store_id" uuid NOT NULL,
	"courier" text NOT NULL,
	"credentials" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courier_accounts_store_id_courier_pk" PRIMARY KEY("store_id","courier"),
	CONSTRAINT "courier_accounts_courier" CHECK ("courier_accounts"."courier" in ('steadfast'))
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"courier" text NOT NULL,
	"consignment_id" text NOT NULL,
	"tracking_code" text DEFAULT '' NOT NULL,
	"courier_status" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courier_accounts" ADD CONSTRAINT "courier_accounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE cascade ON UPDATE no action;