ALTER TABLE "stores" ADD COLUMN "sitemap_kinds" text[] DEFAULT '{product,collection,storePage,landingPage}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "code_head" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "code_body_start" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "code_body_end" text DEFAULT '' NOT NULL;