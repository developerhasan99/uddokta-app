-- Themes: every member can look; owners and admins change, publish and delete them. The live theme cannot be deleted:
-- the store's deferred key to it fails the transaction.
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON themes, theme_media TO uddokta_app;
--> statement-breakpoint
CREATE POLICY themes_read ON themes FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY themes_manage ON themes FOR ALL TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin')) WITH CHECK (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
ALTER TABLE theme_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY theme_media_read ON theme_media FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY theme_media_manage ON theme_media FOR ALL TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin')) WITH CHECK (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
ALTER TABLE theme_media ADD CONSTRAINT theme_media_media_fk FOREIGN KEY (store_id, media_id) REFERENCES media (store_id, id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE stores ADD CONSTRAINT stores_live_theme_fk FOREIGN KEY (id, live_theme_id) REFERENCES themes (store_id, id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- What buyers see: the live theme's published copy (null until a store has one; the storefront then uses the starter theme).
CREATE FUNCTION storefront_theme(store uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.published FROM stores s JOIN themes t ON t.store_id = s.id AND t.id = s.live_theme_id WHERE s.id = store
$$;
--> statement-breakpoint
-- Collections a buyer can open (with active products), with their image, for the Collection list block.
CREATE FUNCTION storefront_collection_cards(store uuid)
RETURNS TABLE (id uuid, name text, handle text, image_key text, image_width integer, image_height integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name, c.handle, m.thumb_key, m.width, m.height FROM collections c LEFT JOIN media m ON m.id = c.media_id AND m.store_id = c.store_id
  WHERE c.store_id = store AND EXISTS (SELECT 1 FROM collection_products cp JOIN products p ON p.id = cp.product_id WHERE cp.collection_id = c.id AND p.status = 'active')
  ORDER BY c.name
$$;
--> statement-breakpoint
-- The storefront also needs a store's logo and contact details for its header, footer and contact page.
CREATE FUNCTION storefront_store_info(store uuid)
RETURNS TABLE (logo_key text, logo_width integer, logo_height integer, phone text, whatsapp text, email text, address text, facebook text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.key, m.width, m.height, s.phone, s.whatsapp, s.email, s.address, s.facebook FROM stores s LEFT JOIN media m ON m.id = s.logo_media_id AND m.store_id = s.id WHERE s.id = store
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_theme, storefront_collection_cards, storefront_store_info FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_theme, storefront_collection_cards, storefront_store_info TO uddokta_app;
