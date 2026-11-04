-- The same pricing and stock path for orders the team types in from Messenger, WhatsApp or a call.
-- Only storefront orders are limited per number: a seller entering repeat orders is not a flood.
DROP FUNCTION place_order(uuid, uuid, uuid, integer, text, text, text, text);
--> statement-breakpoint
CREATE FUNCTION place_order(store uuid, page uuid, variant uuid, qty integer, buyer_name text, buyer_phone text, buyer_address text, buyer_area text, order_source text DEFAULT 'landing_page')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  item record;
  ships_from uuid;
  next_number integer;
  new_id uuid;
  charge integer;
BEGIN
  IF qty NOT BETWEEN 1 AND 100 OR buyer_area NOT IN ('inside', 'outside')
    OR order_source NOT IN ('landing_page', 'messenger', 'whatsapp', 'phone', 'facebook_comment', 'instagram', 'shop', 'other')
    OR (order_source = 'landing_page' AND qty > 20) THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
  IF page IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pages WHERE id = page AND store_id = store AND published IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
  SELECT CASE WHEN buyer_area = 'outside' THEN delivery_outside ELSE delivery_inside END INTO charge FROM stores WHERE id = store;
  SELECT v.id, v.price, v.stock, array_to_string(v.options, ' / ') AS label, p.name INTO item
  FROM product_variants v JOIN products p ON p.id = v.product_id
  WHERE v.id = variant AND v.store_id = store AND p.status IN ('active', 'unlisted');
  IF NOT FOUND THEN RAISE EXCEPTION 'not on sale' USING ERRCODE = 'UD010'; END IF;

  IF item.stock IS NULL THEN
    SELECT id INTO ships_from FROM warehouses WHERE store_id = store ORDER BY created_at, id LIMIT 1;
  ELSE
    UPDATE warehouse_stock SET quantity = quantity - qty
    WHERE variant_id = variant AND quantity >= qty
      AND warehouse_id = (SELECT warehouse_id FROM warehouse_stock WHERE variant_id = variant AND quantity >= qty ORDER BY quantity DESC, warehouse_id LIMIT 1)
    RETURNING warehouse_id INTO ships_from;
    IF ships_from IS NULL THEN RAISE EXCEPTION 'sold out' USING ERRCODE = 'UD011'; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('orders:' || store));
  -- A real buyer rarely orders more than a few times an hour; more than this from one number is a flood, not demand.
  -- ponytail: per-number only; add a per-IP limit at the CDN once Cloudflare is in front.
  IF order_source = 'landing_page' AND (SELECT count(*) FROM orders WHERE store_id = store AND phone = buyer_phone AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'too many orders' USING ERRCODE = 'UD014';
  END IF;
  SELECT COALESCE(MAX(number), 1000) + 1 INTO next_number FROM orders WHERE store_id = store;
  INSERT INTO orders (store_id, number, customer_name, phone, address, area, subtotal, delivery_charge, total, source, page_id, warehouse_id)
  VALUES (store, next_number, buyer_name, buyer_phone, buyer_address, buyer_area, item.price * qty, charge, item.price * qty + charge, order_source, page, ships_from)
  RETURNING id INTO new_id;
  INSERT INTO order_items (store_id, order_id, variant_id, product_name, variant_label, price, quantity, stock_taken)
  VALUES (store, new_id, variant, item.name, item.label, item.price, qty, item.stock IS NOT NULL);
  RETURN next_number;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION place_order FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION place_order TO uddokta_app;
