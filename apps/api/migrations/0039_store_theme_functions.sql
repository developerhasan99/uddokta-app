ALTER TABLE stores ADD CONSTRAINT stores_theme CHECK (theme ~ '^[a-z]{1,20}$');
--> statement-breakpoint
DROP FUNCTION storefront_store(text);
--> statement-breakpoint
CREATE FUNCTION storefront_store(store_handle text)
RETURNS TABLE (id uuid, name text, delivery_inside integer, delivery_outside integer, theme text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, name, delivery_inside, delivery_outside, theme FROM stores WHERE handle = store_handle
$$;
--> statement-breakpoint
DROP FUNCTION storefront_page(text, text);
--> statement-breakpoint
CREATE FUNCTION storefront_page(store_handle text, page_handle text)
RETURNS TABLE (store_id uuid, store_name text, delivery_inside integer, delivery_outside integer, theme text, page_id uuid, title text, seo_title text, seo_description text, content jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.name, s.delivery_inside, s.delivery_outside, s.theme, p.id, p.title, p.seo_title, p.seo_description, p.published
  FROM pages p JOIN stores s ON s.id = p.store_id
  WHERE s.handle = store_handle AND p.handle = page_handle AND p.published IS NOT NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_store, storefront_page FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_store, storefront_page TO uddokta_app;
