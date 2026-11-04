ALTER TABLE stores ADD CONSTRAINT stores_pixels CHECK (meta_pixel ~ '^([0-9]{5,20})?$' AND tiktok_pixel ~ '^([A-Z0-9]{5,30})?$');
--> statement-breakpoint
-- The pixels to load on a store's pages; public, as they appear in the page source anyway.
CREATE FUNCTION storefront_tracking(store uuid) RETURNS TABLE (meta_pixel text, tiktok_pixel text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT meta_pixel, tiktok_pixel FROM stores WHERE id = store
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_tracking FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_tracking TO uddokta_app;
