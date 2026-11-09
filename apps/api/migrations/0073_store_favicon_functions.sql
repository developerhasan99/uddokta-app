-- The favicon is one of the store's own gallery images, held like the logo so it cannot be deleted while set.
ALTER TABLE stores ADD CONSTRAINT stores_favicon_fk FOREIGN KEY (id, favicon_media_id) REFERENCES media (store_id, id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- The storefront's /favicon.ico: the thumbnail key of a store's favicon, or nothing. Public, as every visitor's browser asks for it.
CREATE FUNCTION storefront_favicon(store_handle text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.thumb_key FROM stores s JOIN media m ON m.store_id = s.id AND m.id = s.favicon_media_id WHERE s.handle = store_handle
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_favicon FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_favicon TO uddokta_app;
