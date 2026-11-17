ALTER TABLE "stores" ADD COLUMN "language" text DEFAULT 'bn' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_language" CHECK ("stores"."language" in ('bn', 'en'));--> statement-breakpoint
-- The storefront reads the store's language with its other preferences.
DROP FUNCTION storefront_preferences(uuid);--> statement-breakpoint
CREATE FUNCTION storefront_preferences(store uuid)
RETURNS TABLE (home_title text, home_description text, share_key text, share_width integer, share_height integer, password_hash text, password_message text, language text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.home_title, s.home_description, m.key, m.width, m.height, s.store_password_hash, s.password_message, s.language
  FROM stores s LEFT JOIN media m ON m.id = s.share_media_id AND m.store_id = s.id WHERE s.id = store
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_preferences FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_preferences TO uddokta_app;
