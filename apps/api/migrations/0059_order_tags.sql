ALTER TABLE "orders" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tags" CHECK (cardinality("orders"."tags") <= 10);