-- Cart checkout: like place_checkout, but for several lines from the online store's cart. Retries with the same token
-- and the same values get the first receipt back; the same token with different values is refused. place_order_lines
-- prices every line, delivery and discount, takes stock and records the warehouse; nothing here or in app code does.
CREATE FUNCTION place_cart_checkout(receipt_token uuid, store uuid, lines jsonb, buyer_name text, buyer_phone text, buyer_address text, rate uuid, coupon text DEFAULT '')
RETURNS TABLE (number integer, total integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  existing checkout_receipts%ROWTYPE;
  request_fingerprint text;
  placed record;
BEGIN
  IF receipt_token IS NULL THEN RAISE EXCEPTION 'invalid checkout' USING ERRCODE = 'UD017'; END IF;
  request_fingerprint := md5(jsonb_build_array('cart', lines, buyer_name, buyer_phone, buyer_address, rate, coalesce(coupon, ''))::text);
  PERFORM pg_advisory_xact_lock(hashtext('checkout:' || store), hashtext(receipt_token::text));
  SELECT * INTO existing FROM checkout_receipts r WHERE r.store_id = store AND r.token = receipt_token;
  IF FOUND THEN
    IF existing.fingerprint <> request_fingerprint THEN RAISE EXCEPTION 'checkout already used' USING ERRCODE = 'UD017'; END IF;
    RETURN QUERY SELECT existing.number, existing.total;
    RETURN;
  END IF;
  SELECT * INTO placed FROM place_order_lines(store, NULL, lines, buyer_name, buyer_phone, buyer_address, rate, 'website', coupon);
  INSERT INTO checkout_receipts (store_id, token, fingerprint, number, total) VALUES (store, receipt_token, request_fingerprint, placed.number, placed.total);
  RETURN QUERY SELECT placed.number::integer, placed.total::integer;
END $$;
--> statement-breakpoint
-- What the cart shows for each variant a buyer put in it: only variants of listed or unlisted products (drafts drop out).
CREATE FUNCTION storefront_cart_lines(store uuid, ids uuid[])
RETURNS TABLE (variant_id uuid, product_id uuid, product_name text, product_handle text, options text[], price integer, compare_price integer, stock integer, image_key text, image_alt text, image_width integer, image_height integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT v.id, p.id, p.name, p.handle, v.options, v.price, v.compare_price, v.stock, m.thumb_key, m.alt, m.width, m.height
  FROM product_variants v JOIN products p ON p.id = v.product_id AND p.status IN ('active', 'unlisted')
  LEFT JOIN LATERAL (SELECT mm.thumb_key, mm.alt, mm.width, mm.height FROM product_media pm JOIN media mm ON mm.id = pm.media_id WHERE pm.product_id = p.id ORDER BY pm.position LIMIT 1) m ON true
  WHERE v.store_id = store AND v.id = ANY (ids)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION place_cart_checkout, storefront_cart_lines FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION place_cart_checkout, storefront_cart_lines TO uddokta_app;
--> statement-breakpoint
-- Store search: active products whose name, type, brand or a tag contains the words (Bangla works with ILIKE, which
-- compares characters). ponytail: a scan per search; add a trigram index, or Typesense, once stores have thousands of products.
CREATE FUNCTION storefront_search(store uuid, words text, page_size integer)
RETURNS TABLE (id uuid, name text, handle text, min_price integer, compare_price integer, image_key text, image_alt text, image_width integer, image_height integer, in_stock boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.name, p.handle, v.min_price, v.compare_price, i.key, i.alt, i.width, i.height, v.in_stock
  FROM products p
  CROSS JOIN LATERAL (SELECT min(price)::int AS min_price, max(compare_price)::int AS compare_price, bool_or(stock IS NULL OR stock > 0) AS in_stock FROM product_variants WHERE product_id = p.id) v
  LEFT JOIN LATERAL (SELECT m.key, m.alt, m.width, m.height FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id ORDER BY pm.position LIMIT 1) i ON true
  WHERE p.store_id = store AND p.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM regexp_split_to_table(btrim(words), '\s+') w
      WHERE w <> '' AND NOT (p.name ILIKE '%' || w || '%' OR p.product_type ILIKE '%' || w || '%' OR p.brand ILIKE '%' || w || '%' OR EXISTS (SELECT 1 FROM unnest(p.tags) tg WHERE tg ILIKE '%' || w || '%')))
  ORDER BY p.name
  LIMIT page_size
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_search FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_search TO uddokta_app;
