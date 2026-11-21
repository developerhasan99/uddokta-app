ALTER TABLE "stores" ADD COLUMN "seo_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "robots_txt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "google_verification" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- The robots.txt is served as plain text; the verification code goes into a meta tag, so only its own characters.
ALTER TABLE "stores" ADD CONSTRAINT "stores_search_engines" CHECK (char_length(robots_txt) <= 5000 AND google_verification ~ '^[A-Za-z0-9_-]{0,100}$');--> statement-breakpoint
DROP FUNCTION storefront_preferences(uuid);--> statement-breakpoint
CREATE FUNCTION storefront_preferences(store uuid)
RETURNS TABLE (home_title text, home_description text, share_key text, share_width integer, share_height integer, password_hash text, password_message text, language text, seo_hidden boolean, robots_txt text, google_verification text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.home_title, s.home_description, m.key, m.width, m.height, s.store_password_hash, s.password_message, s.language, s.seo_hidden, s.robots_txt, s.google_verification
  FROM stores s LEFT JOIN media m ON m.id = s.share_media_id AND m.store_id = s.id WHERE s.id = store
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_preferences FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_preferences TO uddokta_app;--> statement-breakpoint
-- Everything a buyer (or a search engine) can open in a store, for /sitemap.xml: active products (never unlisted or
-- drafts), collections, visible and due store pages, and published landing pages (by their live address).
CREATE FUNCTION storefront_sitemap(store uuid)
RETURNS TABLE (kind text, handle text, changed timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT 'product', p.handle, NULL::timestamptz FROM products p WHERE p.store_id = store AND p.status = 'active'
  UNION ALL SELECT 'collection', c.handle, NULL FROM collections c WHERE c.store_id = store
  UNION ALL SELECT 'storePage', sp.handle, sp.updated_at FROM store_pages sp WHERE sp.store_id = store AND sp.visible AND (sp.publish_at IS NULL OR sp.publish_at <= now())
  UNION ALL SELECT 'landingPage', pg.published_meta->>'handle', pg.published_at FROM pages pg WHERE pg.store_id = store AND pg.published IS NOT NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_sitemap FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_sitemap TO uddokta_app;
