ALTER TABLE "stores" ADD COLUMN "home_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "home_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "share_media_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "store_password_hash" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "password_message" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE stores ADD CONSTRAINT stores_preferences_text CHECK (char_length(home_title) <= 300 AND char_length(home_description) <= 1000 AND char_length(password_message) <= 300);--> statement-breakpoint
-- The share image is one of the store's own, held like the logo so it cannot be deleted while set.
ALTER TABLE stores ADD CONSTRAINT stores_share_fk FOREIGN KEY (id, share_media_id) REFERENCES media (store_id, id) DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- What the storefront needs for its home page and password check. The hash never leaves the server.
CREATE FUNCTION storefront_preferences(store uuid)
RETURNS TABLE (home_title text, home_description text, share_key text, share_width integer, share_height integer, password_hash text, password_message text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.home_title, s.home_description, m.key, m.width, m.height, s.store_password_hash, s.password_message
  FROM stores s LEFT JOIN media m ON m.id = s.share_media_id AND m.store_id = s.id WHERE s.id = store
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_preferences FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_preferences TO uddokta_app;
