CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"spent_on" date NOT NULL,
	"category" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_category" CHECK ("expenses"."category" in ('ads', 'packaging', 'courier', 'salary', 'rent', 'other')),
	CONSTRAINT "expenses_amount" CHECK ("expenses"."amount" > 0 and "expenses"."amount" <= 100000000 and length("expenses"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "order_item_costs" (
	"order_item_id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"cost" integer NOT NULL,
	CONSTRAINT "order_item_costs_amount" CHECK ("order_item_costs"."cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_costs" ADD CONSTRAINT "order_item_costs_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_costs" ADD CONSTRAINT "order_item_costs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_store_date" ON "expenses" USING btree ("store_id","spent_on");