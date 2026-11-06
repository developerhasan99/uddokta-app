-- Orders with several products. place_order_lines prices every line, takes stock and records the buying prices;
-- place_order keeps its old one-product signature for the storefront and checkout and simply calls it with one line.
-- Cancelling or a return puts stock back into orders.warehouse_id, so every tracked line ships from that one warehouse.
CREATE FUNCTION place_order_lines(store uuid, page uuid, lines jsonb, buyer_name text, buyer_phone text, buyer_address text, buyer_area text,
  order_source text DEFAULT 'landing_page', coupon text DEFAULT '')
RETURNS TABLE (number integer, total integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  variant_ids uuid[];
  qtys integer[];
  priced integer;
  tracked integer;
  taken integer;
  code record;
  ships_from uuid;
  next_number integer;
  new_id uuid;
  charge integer;
  subtotal integer;
  off integer := 0;
  applied text := '';
BEGIN
  -- Lines are [{"variant": uuid, "qty": 1..100}], at most 20; the same variant twice is one line.
  IF jsonb_typeof(lines) <> 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 20
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(lines) l
      WHERE jsonb_typeof(l) <> 'object' OR jsonb_typeof(l->'qty') <> 'number' OR coalesce(l->>'variant', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR (l->>'qty') !~ '^[0-9]+$' OR (l->>'qty')::integer NOT BETWEEN 1 AND 100) THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
  SELECT array_agg(s.vid ORDER BY s.vid), array_agg(s.q ORDER BY s.vid) INTO variant_ids, qtys
  FROM (SELECT (l->>'variant')::uuid AS vid, sum((l->>'qty')::integer)::integer AS q FROM jsonb_array_elements(lines) l GROUP BY 1) s;

  IF buyer_area NOT IN ('inside', 'outside')
    OR order_source NOT IN ('landing_page', 'website', 'messenger', 'whatsapp', 'phone', 'facebook_comment', 'instagram', 'shop', 'other')
    OR EXISTS (SELECT 1 FROM unnest(qtys) q WHERE q > 100)
    OR (order_source IN ('landing_page', 'website') AND (SELECT sum(q) FROM unnest(qtys) q) > 20) THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
  IF page IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pages WHERE id = page AND store_id = store AND published IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
  SELECT CASE WHEN buyer_area = 'outside' THEN delivery_outside ELSE delivery_inside END INTO charge FROM stores WHERE id = store;

  SELECT count(*), coalesce(sum(v.price * w.q), 0), count(*) FILTER (WHERE v.stock IS NOT NULL) INTO priced, subtotal, tracked
  FROM unnest(variant_ids, qtys) w(vid, q)
  JOIN product_variants v ON v.id = w.vid AND v.store_id = store
  JOIN products p ON p.id = v.product_id AND p.status IN ('active', 'unlisted');
  IF priced <> cardinality(variant_ids) THEN RAISE EXCEPTION 'not on sale' USING ERRCODE = 'UD010'; END IF;

  -- The use is counted in the same statement that checks the limit, so two buyers cannot take the last use together.
  IF coalesce(coupon, '') <> '' THEN
    UPDATE discounts d SET uses = d.uses + 1
    WHERE d.store_id = store AND d.code = upper(coupon) AND d.active AND (d.ends_at IS NULL OR d.ends_at > now())
      AND (d.max_uses IS NULL OR d.uses < d.max_uses) AND subtotal >= d.min_subtotal
    RETURNING d.code, d.kind, d.value INTO code;
    IF NOT FOUND THEN RAISE EXCEPTION 'coupon' USING ERRCODE = 'UD016'; END IF;
    applied := code.code;
    off := CASE WHEN code.kind = 'percent' THEN (subtotal * code.value) / 100 ELSE least(code.value, subtotal) END;
  END IF;

  IF tracked = 0 THEN
    SELECT id INTO ships_from FROM warehouses WHERE store_id = store ORDER BY created_at, id LIMIT 1;
  ELSE
    -- One warehouse that holds every tracked line, the fullest first (for one line this is the old choice).
    SELECT wh.id INTO ships_from FROM warehouses wh
    WHERE wh.store_id = store AND NOT EXISTS (
      SELECT 1 FROM unnest(variant_ids, qtys) w(vid, q) JOIN product_variants v ON v.id = w.vid
      WHERE v.stock IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouse_stock s WHERE s.variant_id = w.vid AND s.warehouse_id = wh.id AND s.quantity >= w.q))
    ORDER BY (SELECT coalesce(sum(s.quantity), 0) FROM warehouse_stock s WHERE s.warehouse_id = wh.id AND s.variant_id = ANY (variant_ids)) DESC, wh.created_at, wh.id
    LIMIT 1;
    IF ships_from IS NULL THEN RAISE EXCEPTION 'sold out' USING ERRCODE = 'UD011'; END IF;
    -- Subtract in place; a sale that raced us leaves a line short, and then the whole order is refused.
    UPDATE warehouse_stock s SET quantity = s.quantity - w.q
    FROM unnest(variant_ids, qtys) w(vid, q)
    WHERE s.variant_id = w.vid AND s.warehouse_id = ships_from AND s.quantity >= w.q;
    GET DIAGNOSTICS taken = ROW_COUNT;
    IF taken <> tracked THEN RAISE EXCEPTION 'sold out' USING ERRCODE = 'UD011'; END IF;
  END IF;

  IF order_source IN ('landing_page', 'website') AND EXISTS (SELECT 1 FROM blocked_phones WHERE store_id = store AND phone = buyer_phone) THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = 'UD015';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('orders:' || store));
  -- A real buyer rarely orders more than a few times an hour; more than this from one number is a flood, not demand.
  -- ponytail: per-number only; add a per-IP limit at the CDN once Cloudflare is in front.
  IF order_source IN ('landing_page', 'website') AND (SELECT count(*) FROM orders o WHERE o.store_id = store AND o.phone = buyer_phone AND o.created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'too many orders' USING ERRCODE = 'UD014';
  END IF;
  SELECT COALESCE(MAX(o.number), 1000) + 1 INTO next_number FROM orders o WHERE o.store_id = store;
  INSERT INTO orders (store_id, number, customer_name, phone, address, area, subtotal, delivery_charge, discount, discount_code, total, source, page_id, warehouse_id)
  VALUES (store, next_number, buyer_name, buyer_phone, buyer_address, buyer_area, subtotal, charge, off, applied, subtotal + charge - off, order_source, page, ships_from)
  RETURNING id INTO new_id;
  UPDATE checkout_drafts SET status = 'ordered', updated_at = now() WHERE store_id = store AND phone = buyer_phone AND status = 'open';
  WITH added AS (
    INSERT INTO order_items (store_id, order_id, variant_id, product_name, variant_label, price, quantity, stock_taken)
    SELECT store, new_id, w.vid, p.name, array_to_string(v.options, ' / '), v.price, w.q, v.stock IS NOT NULL
    FROM unnest(variant_ids, qtys) w(vid, q)
    JOIN product_variants v ON v.id = w.vid JOIN products p ON p.id = v.product_id
    RETURNING id, variant_id
  )
  INSERT INTO order_item_costs (order_item_id, store_id, cost)
  SELECT added.id, store, c.cost FROM added JOIN product_variant_costs c ON c.variant_id = added.variant_id;
  RETURN QUERY SELECT next_number, subtotal + charge - off;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION place_order_lines FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION place_order_lines TO uddokta_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION place_order(store uuid, page uuid, variant uuid, qty integer, buyer_name text, buyer_phone text, buyer_address text, buyer_area text,
  order_source text DEFAULT 'landing_page', coupon text DEFAULT '')
RETURNS TABLE (number integer, total integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF variant IS NULL OR qty IS NULL THEN RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010'; END IF;
  RETURN QUERY SELECT * FROM place_order_lines(store, page, jsonb_build_array(jsonb_build_object('variant', variant, 'qty', qty)),
    buyer_name, buyer_phone, buyer_address, buyer_area, order_source, coupon);
END $$;
