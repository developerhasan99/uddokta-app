ALTER TABLE "stores" ADD COLUMN "logo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "whatsapp" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "facebook" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "legal_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "trade_licence" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "bin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "invoice_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_phones" CHECK ("stores"."phone" ~ '^(\+?[0-9][0-9 -]{5,19})?$' and "stores"."whatsapp" ~ '^(\+?[0-9][0-9 -]{5,19})?$');--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_email" CHECK ("stores"."email" ~ '^([^\s@]+@[^\s@]+\.[^\s@]+)?$' and char_length("stores"."email") <= 200);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_facebook" CHECK ("stores"."facebook" ~ '^(https://[^\s]+)?$' and char_length("stores"."facebook") <= 300);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_details_length" CHECK (char_length("stores"."address") <= 300 and char_length("stores"."legal_name") <= 100 and char_length("stores"."trade_licence") <= 50 and char_length("stores"."bin") <= 50 and char_length("stores"."invoice_note") <= 300);