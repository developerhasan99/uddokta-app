-- Deferred to commit: deleting a store removes its pages and media in an undefined order,
-- and only the final state matters. Deleting an image a page still uses fails here.
ALTER TABLE page_media ADD CONSTRAINT page_media_media_fk FOREIGN KEY (store_id, media_id) REFERENCES media (store_id, id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON pages, page_media TO uddokta_app;
--> statement-breakpoint
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE page_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Any team member can make, edit and publish pages; only owners and admins can delete them.
CREATE POLICY pages_read ON pages FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY pages_add ON pages FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY pages_change ON pages FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY pages_remove ON pages FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
CREATE POLICY page_media_member ON page_media FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
-- The storefront has no signed-in user, so it reads only through these: published pages, and the images and
-- on-sale products they show. Drafts, buying prices and draft products never leave the database this way.
CREATE FUNCTION storefront_page(store_handle text, page_handle text)
RETURNS TABLE (store_id uuid, store_name text, page_id uuid, title text, seo_title text, seo_description text, content jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.name, p.id, p.title, p.seo_title, p.seo_description, p.published
  FROM pages p JOIN stores s ON s.id = p.store_id
  WHERE s.handle = store_handle AND p.handle = page_handle AND p.published IS NOT NULL
$$;
--> statement-breakpoint
CREATE FUNCTION storefront_media(store uuid, ids uuid[])
RETURNS TABLE (id uuid, key text, alt text, width integer, height integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, key, alt, width, height FROM media WHERE store_id = store AND id = ANY (ids)
$$;
--> statement-breakpoint
CREATE FUNCTION storefront_products(store uuid, ids uuid[])
RETURNS TABLE (id uuid, name text, image_key text, image_alt text, image_width integer, image_height integer, variants jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.name, i.key, i.alt, i.width, i.height,
    (SELECT jsonb_agg(jsonb_build_object('id', v.id, 'options', v.options, 'price', v.price, 'comparePrice', v.compare_price, 'stock', v.stock) ORDER BY v.position)
     FROM product_variants v WHERE v.product_id = p.id)
  FROM products p
  LEFT JOIN LATERAL (
    SELECT m.key, m.alt, m.width, m.height FROM product_media pm JOIN media m ON m.id = pm.media_id
    WHERE pm.product_id = p.id ORDER BY pm.position LIMIT 1
  ) i ON true
  WHERE p.store_id = store AND p.id = ANY (ids) AND p.status IN ('active', 'unlisted')
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_page, storefront_media, storefront_products FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_page, storefront_media, storefront_products TO uddokta_app;
