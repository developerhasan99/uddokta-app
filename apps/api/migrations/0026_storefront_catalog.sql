-- The store's own pages: home, product and collection. Like storefront_page, these return only what buyers may see:
-- active products in listings, active and unlisted ones by direct link, never drafts or buying prices.
CREATE FUNCTION storefront_store(store_handle text)
RETURNS TABLE (id uuid, name text, delivery_inside integer, delivery_outside integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, name, delivery_inside, delivery_outside FROM stores WHERE handle = store_handle
$$;
--> statement-breakpoint
CREATE FUNCTION storefront_listing(store uuid, collection uuid, page_size integer, skip integer)
RETURNS TABLE (id uuid, name text, handle text, min_price integer, compare_price integer, image_key text, image_alt text, image_width integer, image_height integer, in_stock boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.name, p.handle, v.min_price, v.compare_price, i.key, i.alt, i.width, i.height, v.in_stock
  FROM products p
  CROSS JOIN LATERAL (
    SELECT min(price)::int AS min_price, max(compare_price)::int AS compare_price, bool_or(stock IS NULL OR stock > 0) AS in_stock
    FROM product_variants WHERE product_id = p.id
  ) v
  LEFT JOIN LATERAL (
    SELECT m.key, m.alt, m.width, m.height FROM product_media pm JOIN media m ON m.id = pm.media_id
    WHERE pm.product_id = p.id ORDER BY pm.position LIMIT 1
  ) i ON true
  LEFT JOIN collection_products cp ON cp.product_id = p.id AND cp.collection_id = collection
  WHERE p.store_id = store AND p.status = 'active' AND (collection IS NULL OR cp.collection_id IS NOT NULL)
  ORDER BY CASE WHEN collection IS NULL THEN 0 ELSE cp.position END, p.created_at DESC, p.id
  LIMIT LEAST(page_size, 100) OFFSET skip
$$;
--> statement-breakpoint
CREATE FUNCTION storefront_product(store uuid, product_handle text)
RETURNS TABLE (id uuid, name text, description text, seo_title text, seo_description text, status text, images jsonb, variants jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.name, p.description, p.seo_title, p.seo_description, p.status,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('key', m.key, 'alt', m.alt, 'width', m.width, 'height', m.height) ORDER BY pm.position)
      FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id), '[]'),
    (SELECT jsonb_agg(jsonb_build_object('id', v.id, 'options', v.options, 'price', v.price, 'comparePrice', v.compare_price, 'stock', v.stock) ORDER BY v.position)
      FROM product_variants v WHERE v.product_id = p.id)
  FROM products p
  WHERE p.store_id = store AND p.handle = product_handle AND p.status IN ('active', 'unlisted')
$$;
--> statement-breakpoint
CREATE FUNCTION storefront_collections(store uuid)
RETURNS TABLE (id uuid, name text, handle text, description text, seo_title text, seo_description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name, c.handle, c.description, c.seo_title, c.seo_description FROM collections c
  WHERE c.store_id = store AND EXISTS (SELECT 1 FROM collection_products cp JOIN products p ON p.id = cp.product_id WHERE cp.collection_id = c.id AND p.status = 'active')
  ORDER BY c.name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_store, storefront_listing, storefront_product, storefront_collections FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_store, storefront_listing, storefront_product, storefront_collections TO uddokta_app;
