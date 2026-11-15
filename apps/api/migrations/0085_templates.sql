ALTER TABLE "collections" ADD COLUMN "template" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "template" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_template" CHECK ("template" ~ '^[a-z0-9-]{0,30}$');--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_template" CHECK ("template" ~ '^[a-z0-9-]{0,30}$');--> statement-breakpoint
-- The storefront also needs each product's and collection's chosen template.
DROP FUNCTION storefront_product(uuid, text);--> statement-breakpoint
CREATE FUNCTION storefront_product(store uuid, product_handle text)
RETURNS TABLE (id uuid, name text, description text, seo_title text, seo_description text, status text, images jsonb, variants jsonb, template text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.name, p.description, p.seo_title, p.seo_description, p.status,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('key', m.key, 'alt', m.alt, 'width', m.width, 'height', m.height) ORDER BY pm.position)
      FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id), '[]'),
    (SELECT jsonb_agg(jsonb_build_object('id', v.id, 'options', v.options, 'price', v.price, 'comparePrice', v.compare_price, 'stock', v.stock) ORDER BY v.position)
      FROM product_variants v WHERE v.product_id = p.id),
    p.template
  FROM products p
  WHERE p.store_id = store AND p.handle = product_handle AND p.status IN ('active', 'unlisted')
$$;--> statement-breakpoint
DROP FUNCTION storefront_collections(uuid);--> statement-breakpoint
CREATE FUNCTION storefront_collections(store uuid)
RETURNS TABLE (id uuid, name text, handle text, description text, seo_title text, seo_description text, template text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name, c.handle, c.description, c.seo_title, c.seo_description, c.template FROM collections c
  WHERE c.store_id = store AND EXISTS (SELECT 1 FROM collection_products cp JOIN products p ON p.id = cp.product_id WHERE cp.collection_id = c.id AND p.status = 'active')
  ORDER BY c.name
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_product, storefront_collections FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_product, storefront_collections TO uddokta_app;
