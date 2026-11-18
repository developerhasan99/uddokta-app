CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"billing_whatsapp" text DEFAULT '' NOT NULL,
	"billing_bkash" text DEFAULT '' NOT NULL,
	"billing_nagad" text DEFAULT '' NOT NULL,
	"billing_bank" text DEFAULT '' NOT NULL,
	"billing_note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_one_row" CHECK ("platform_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "features" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "billing_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_one_custom_per_store" ON "plans" USING btree ("store_id") WHERE "plans"."store_id" is not null;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_custom_not_default" CHECK (not ("plans"."is_default" and "plans"."store_id" is not null));--> statement-breakpoint
-- Existing plans keep everything they had: every tool, and the own domain only where it was allowed.
UPDATE plans SET features = ARRAY['onlineStore', 'courierBooking', 'discounts', 'fakeOrderProtection', 'incompleteOrders', 'repeatSales', 'analytics', 'adTracking']
  || CASE WHEN custom_domain THEN ARRAY['customDomain'] ELSE ARRAY[]::text[] END;--> statement-breakpoint
ALTER TABLE plans ADD CONSTRAINT plans_features_known CHECK (features <@ ARRAY['onlineStore', 'customDomain', 'courierBooking', 'discounts', 'fakeOrderProtection', 'incompleteOrders', 'repeatSales', 'analytics', 'adTracking']);--> statement-breakpoint
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON platform_settings FROM PUBLIC;--> statement-breakpoint
INSERT INTO platform_settings (id) VALUES (1);
