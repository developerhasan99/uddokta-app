ALTER TABLE "stores" ADD COLUMN "delivery_inside" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "delivery_outside" integer DEFAULT 130 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_delivery" CHECK ("stores"."delivery_inside" between 0 and 100000 and "stores"."delivery_outside" between 0 and 100000);