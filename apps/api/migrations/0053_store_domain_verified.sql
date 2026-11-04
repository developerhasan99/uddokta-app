ALTER TABLE "stores" DROP CONSTRAINT "stores_domain_unique";--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "domain_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "domain_primary" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stores_verified_domain" ON "stores" USING btree ("domain") WHERE "stores"."domain_verified_at" is not null;