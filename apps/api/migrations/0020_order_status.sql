ALTER TABLE "order_items" ADD COLUMN "stock_taken" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;