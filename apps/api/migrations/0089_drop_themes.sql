-- Themes are replaced by templates (0090). Each store keeps its look: the live theme's settings and CSS become Site settings.
ALTER TABLE "stores" ADD COLUMN "site_style" jsonb;--> statement-breakpoint
UPDATE stores s SET site_style = (t.published->'settings') || jsonb_build_object('css', coalesce(t.published->>'css', ''))
  FROM themes t WHERE t.id = s.live_theme_id AND t.published IS NOT NULL;--> statement-breakpoint
DELETE FROM versions WHERE theme_id IS NOT NULL;--> statement-breakpoint
DROP FUNCTION storefront_theme(uuid);--> statement-breakpoint
ALTER TABLE "theme_media" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "themes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "theme_media" CASCADE;--> statement-breakpoint
DROP TABLE "themes" CASCADE;--> statement-breakpoint
ALTER TABLE "store_pages" DROP CONSTRAINT "store_pages_text";--> statement-breakpoint
ALTER TABLE "versions" DROP CONSTRAINT "versions_owner";--> statement-breakpoint
ALTER TABLE "versions" DROP CONSTRAINT IF EXISTS "versions_theme";
--> statement-breakpoint
DROP INDEX "versions_theme";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "template";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "template";--> statement-breakpoint
ALTER TABLE "store_pages" DROP COLUMN "template";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "live_theme_id";--> statement-breakpoint
ALTER TABLE "versions" DROP COLUMN "theme_id";--> statement-breakpoint
ALTER TABLE "store_pages" ADD CONSTRAINT "store_pages_text" CHECK (char_length(btrim("store_pages"."title")) between 1 and 200 and char_length("store_pages"."handle") between 1 and 100 and char_length("store_pages"."body") <= 100000 and char_length("store_pages"."seo_title") <= 300 and char_length("store_pages"."seo_description") <= 1000);--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_owner" CHECK ("versions"."page_id" is not null);