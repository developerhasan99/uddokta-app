-- Custom code replaces the Google verification field (the seller pastes Google's tag into the head code instead).
ALTER TABLE "stores" DROP CONSTRAINT "stores_search_engines";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "google_verification";--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_search_engines" CHECK (
  char_length(robots_txt) <= 5000
  AND sitemap_kinds <@ ARRAY['product', 'collection', 'storePage', 'landingPage']::text[]
  AND char_length(code_head) <= 50000 AND char_length(code_body_start) <= 50000 AND char_length(code_body_end) <= 50000
);--> statement-breakpoint
DROP FUNCTION storefront_preferences(uuid);--> statement-breakpoint
CREATE FUNCTION storefront_preferences(store uuid)
RETURNS TABLE (home_title text, home_description text, share_key text, share_width integer, share_height integer, password_hash text, password_message text, language text, seo_hidden boolean, robots_txt text, sitemap_kinds text[], code_head text, code_body_start text, code_body_end text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.home_title, s.home_description, m.key, m.width, m.height, s.store_password_hash, s.password_message, s.language, s.seo_hidden, s.robots_txt, s.sitemap_kinds, s.code_head, s.code_body_start, s.code_body_end
  FROM stores s LEFT JOIN media m ON m.id = s.share_media_id AND m.store_id = s.id WHERE s.id = store
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_preferences FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_preferences TO uddokta_app;
