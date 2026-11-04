CREATE TABLE "checkout_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"page_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_drafts_store_phone" UNIQUE("store_id","phone"),
	CONSTRAINT "checkout_drafts_status" CHECK ("checkout_drafts"."status" in ('open', 'ordered', 'dismissed')),
	CONSTRAINT "checkout_drafts_lengths" CHECK (length("checkout_drafts"."phone") <= 20 and length("checkout_drafts"."name") <= 100 and length("checkout_drafts"."address") <= 500 and length("checkout_drafts"."product_name") <= 300)
);
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD CONSTRAINT "checkout_drafts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_drafts_store_updated" ON "checkout_drafts" USING btree ("store_id","updated_at");