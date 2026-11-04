ALTER TABLE "stores" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "domain_live_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_domain_unique" UNIQUE("domain");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_domain_format" CHECK ("stores"."domain" ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,63}$');