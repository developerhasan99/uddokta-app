-- Delivery options replace the store's two fixed charges. Members read them; owners and admins change them.
-- Buyers never see the table: the storefront reads active options through storefront_shipping.
ALTER TABLE shipping_rates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON shipping_rates TO uddokta_app;
--> statement-breakpoint
CREATE POLICY shipping_rates_read ON shipping_rates FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY shipping_rates_manage ON shipping_rates FOR ALL TO uddokta_app
  USING (my_role(store_id) IN ('owner', 'admin')) WITH CHECK (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
ALTER TABLE shipping_rate_products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON shipping_rate_products TO uddokta_app;
--> statement-breakpoint
CREATE POLICY shipping_rate_products_read ON shipping_rate_products FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY shipping_rate_products_manage ON shipping_rate_products FOR ALL TO uddokta_app
  USING (my_role(store_id) IN ('owner', 'admin')) WITH CHECK (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
-- Deleting an option leaves its orders with the copied name and charge.
ALTER TABLE orders ADD CONSTRAINT orders_shipping_rate FOREIGN KEY (store_id, shipping_rate_id) REFERENCES shipping_rates (store_id, id) ON DELETE SET NULL (shipping_rate_id);
--> statement-breakpoint
-- What delivery costs for an order, from one of the store's options. Free when any of the option's conditions holds:
-- the products total (before any coupon) reaches free_over, the order has free_min_qty items or more,
-- or it includes one of the option's products. Only active options, unless editing an order that already uses this one.
CREATE FUNCTION shipping_charge(store uuid, rate uuid, subtotal integer, qty integer, variant_ids uuid[], allow_inactive boolean DEFAULT false,
  OUT charge integer, OUT rate_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r shipping_rates;
BEGIN
  SELECT * INTO r FROM shipping_rates s WHERE s.id = rate AND s.store_id = store AND (s.active OR allow_inactive);
  IF NOT FOUND THEN RAISE EXCEPTION 'no such delivery option' USING ERRCODE = 'UD019'; END IF;
  rate_name := r.name;
  charge := CASE WHEN (r.free_over IS NOT NULL AND subtotal >= r.free_over)
      OR (r.free_min_qty IS NOT NULL AND qty >= r.free_min_qty)
      OR EXISTS (SELECT 1 FROM shipping_rate_products sp JOIN product_variants v ON v.product_id = sp.product_id WHERE sp.rate_id = r.id AND v.id = ANY (variant_ids))
    THEN 0 ELSE r.price END;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION shipping_charge FROM PUBLIC;
--> statement-breakpoint
DROP FUNCTION place_checkout(uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text);
--> statement-breakpoint
DROP FUNCTION place_order(uuid, uuid, uuid, integer, text, text, text, text, text, text);
--> statement-breakpoint
DROP FUNCTION place_order_lines(uuid, uuid, jsonb, text, text, text, text, text, text);
--> statement-breakpoint
DROP FUNCTION edit_order_lines(uuid, uuid, jsonb, text);
--> statement-breakpoint
-- As before, but the buyer chooses a delivery option instead of inside or outside Dhaka; shipping_charge prices it.
CREATE FUNCTION place_order_lines(store uuid, page uuid, lines jsonb, buyer_name text, buyer_phone text, buyer_address text, rate uuid,
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
  ship record;
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

  IF order_source NOT IN ('landing_page', 'website', 'messenger', 'whatsapp', 'phone', 'facebook_comment', 'instagram', 'shop', 'other')
    OR EXISTS (SELECT 1 FROM unnest(qtys) q WHERE q > 100)
    OR (order_source IN ('landing_page', 'website') AND (SELECT sum(q) FROM unnest(qtys) q) > 20) THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
  IF page IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pages WHERE id = page AND store_id = store AND published IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
  SELECT count(*), coalesce(sum(v.price * w.q), 0), count(*) FILTER (WHERE v.stock IS NOT NULL) INTO priced, subtotal, tracked
  FROM unnest(variant_ids, qtys) w(vid, q)
  JOIN product_variants v ON v.id = w.vid AND v.store_id = store
  JOIN products p ON p.id = v.product_id AND p.status IN ('active', 'unlisted');
  IF priced <> cardinality(variant_ids) THEN RAISE EXCEPTION 'not on sale' USING ERRCODE = 'UD010'; END IF;
  SELECT * INTO ship FROM shipping_charge(store, rate, subtotal, (SELECT sum(q)::integer FROM unnest(qtys) q), variant_ids);

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
  INSERT INTO orders (store_id, number, customer_name, phone, address, shipping_rate_id, shipping_name, subtotal, delivery_charge, discount, discount_code, total, source, page_id, warehouse_id)
  VALUES (store, next_number, buyer_name, buyer_phone, buyer_address, rate, ship.rate_name, subtotal, ship.charge, off, applied, subtotal + ship.charge - off, order_source, page, ships_from)
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
  RETURN QUERY SELECT next_number, subtotal + ship.charge - off;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION place_order_lines FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION place_order_lines TO uddokta_app;
--> statement-breakpoint
CREATE FUNCTION place_order(store uuid, page uuid, variant uuid, qty integer, buyer_name text, buyer_phone text, buyer_address text, rate uuid,
  order_source text DEFAULT 'landing_page', coupon text DEFAULT '')
RETURNS TABLE (number integer, total integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF variant IS NULL OR qty IS NULL THEN RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010'; END IF;
  RETURN QUERY SELECT * FROM place_order_lines(store, page, jsonb_build_array(jsonb_build_object('variant', variant, 'qty', qty)),
    buyer_name, buyer_phone, buyer_address, rate, order_source, coupon);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION place_order FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION place_order TO uddokta_app;
--> statement-breakpoint
CREATE FUNCTION place_checkout(receipt_token uuid, store uuid, page uuid, variant uuid, qty integer, buyer_name text, buyer_phone text, buyer_address text, rate uuid,
  order_source text, coupon text DEFAULT '')
RETURNS TABLE (number integer, total integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  existing checkout_receipts%ROWTYPE;
  request_fingerprint text;
  placed record;
BEGIN
  IF receipt_token IS NULL OR order_source NOT IN ('landing_page', 'website') THEN
    RAISE EXCEPTION 'invalid checkout' USING ERRCODE = 'UD017';
  END IF;
  request_fingerprint := md5(jsonb_build_array(page, variant, qty, buyer_name, buyer_phone, buyer_address, rate, order_source, coalesce(coupon, ''))::text);
  PERFORM pg_advisory_xact_lock(hashtext('checkout:' || store), hashtext(receipt_token::text));
  SELECT * INTO existing FROM checkout_receipts r WHERE r.store_id = store AND r.token = receipt_token;
  IF FOUND THEN
    IF existing.fingerprint <> request_fingerprint THEN
      RAISE EXCEPTION 'checkout already used' USING ERRCODE = 'UD017';
    END IF;
    RETURN QUERY SELECT existing.number, existing.total;
    RETURN;
  END IF;
  SELECT * INTO placed FROM place_order(store, page, variant, qty, buyer_name, buyer_phone, buyer_address, rate, order_source, coupon);
  INSERT INTO checkout_receipts (store_id, token, fingerprint, number, total)
    VALUES (store, receipt_token, request_fingerprint, placed.number, placed.total);
  RETURN QUERY SELECT placed.number::integer, placed.total::integer;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION place_checkout FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION place_checkout TO uddokta_app;
--> statement-breakpoint
CREATE FUNCTION edit_order_lines(store uuid, target uuid, lines jsonb, rate uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cur record;
  variant_ids uuid[];
  qtys integer[];
  priced integer;
  tracked integer;
  taken integer;
  ships_from uuid;
  charge integer;
  rate_id uuid;
  rate_name text;
  ship record;
  new_subtotal integer;
  off integer;
  code record;
  before text;
  after text;
BEGIN
  IF jsonb_typeof(lines) <> 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 20
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(lines) l
      WHERE jsonb_typeof(l) <> 'object' OR jsonb_typeof(l->'qty') <> 'number' OR coalesce(l->>'variant', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR (l->>'qty') !~ '^[0-9]+$' OR (l->>'qty')::integer NOT BETWEEN 1 AND 100) THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
  SELECT array_agg(s.vid ORDER BY s.vid), array_agg(s.q ORDER BY s.vid) INTO variant_ids, qtys
  FROM (SELECT (l->>'variant')::uuid AS vid, sum((l->>'qty')::integer)::integer AS q FROM jsonb_array_elements(lines) l GROUP BY 1) s;
  IF EXISTS (SELECT 1 FROM unnest(qtys) q WHERE q > 100) THEN RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010'; END IF;

  -- The row lock also waits for a status change or a courier booking in progress.
  SELECT * INTO cur FROM orders o WHERE o.id = target AND o.store_id = store FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no order' USING ERRCODE = 'UD013'; END IF;
  IF cur.status NOT IN ('new', 'hold', 'confirmed') THEN RAISE EXCEPTION 'order locked' USING ERRCODE = 'UD018'; END IF;

  SELECT string_agg(i.product_name || CASE WHEN i.variant_label <> '' THEN ' (' || i.variant_label || ')' ELSE '' END || ' × ' || i.quantity, ', ' ORDER BY i.product_name)
  INTO before FROM order_items i WHERE i.order_id = target;

  -- What the order took goes back to the warehouse it came from.
  UPDATE warehouse_stock ws SET quantity = ws.quantity + i.quantity
  FROM order_items i WHERE i.order_id = target AND i.stock_taken AND ws.variant_id = i.variant_id AND ws.warehouse_id = cur.warehouse_id;

  CREATE TEMP TABLE sold ON COMMIT DROP AS
    SELECT i.variant_id, i.price, c.cost FROM order_items i LEFT JOIN order_item_costs c ON c.order_item_id = i.id
    WHERE i.order_id = target AND i.variant_id IS NOT NULL;
  DELETE FROM order_items WHERE order_id = target;

  -- A product already in the order may be sold even if it was hidden since; a new one must be on sale.
  SELECT count(*), coalesce(sum(coalesce(s.price, v.price) * w.q), 0), count(*) FILTER (WHERE v.stock IS NOT NULL) INTO priced, new_subtotal, tracked
  FROM unnest(variant_ids, qtys) w(vid, q)
  JOIN product_variants v ON v.id = w.vid AND v.store_id = store
  JOIN products p ON p.id = v.product_id
  LEFT JOIN sold s ON s.variant_id = w.vid
  WHERE s.variant_id IS NOT NULL OR p.status IN ('active', 'unlisted');
  IF priced <> cardinality(variant_ids) THEN RAISE EXCEPTION 'not on sale' USING ERRCODE = 'UD010'; END IF;

  IF tracked = 0 THEN
    SELECT id INTO ships_from FROM warehouses WHERE store_id = store ORDER BY created_at, id LIMIT 1;
  ELSE
    SELECT wh.id INTO ships_from FROM warehouses wh
    WHERE wh.store_id = store AND NOT EXISTS (
      SELECT 1 FROM unnest(variant_ids, qtys) w(vid, q) JOIN product_variants v ON v.id = w.vid
      WHERE v.stock IS NOT NULL AND NOT EXISTS (SELECT 1 FROM warehouse_stock s WHERE s.variant_id = w.vid AND s.warehouse_id = wh.id AND s.quantity >= w.q))
    ORDER BY (wh.id = cur.warehouse_id) DESC, (SELECT coalesce(sum(s.quantity), 0) FROM warehouse_stock s WHERE s.warehouse_id = wh.id AND s.variant_id = ANY (variant_ids)) DESC, wh.created_at, wh.id
    LIMIT 1;
    IF ships_from IS NULL THEN RAISE EXCEPTION 'sold out' USING ERRCODE = 'UD011'; END IF;
    UPDATE warehouse_stock s SET quantity = s.quantity - w.q
    FROM unnest(variant_ids, qtys) w(vid, q)
    WHERE s.variant_id = w.vid AND s.warehouse_id = ships_from AND s.quantity >= w.q;
    GET DIAGNOSTICS taken = ROW_COUNT;
    IF taken <> tracked THEN RAISE EXCEPTION 'sold out' USING ERRCODE = 'UD011'; END IF;
  END IF;

  -- No option sent keeps the order's own. Its agreed price stays, but free-delivery conditions follow the new products:
  -- now free means free, and no longer free takes the option's current price. Another option is priced afresh.
  -- An order whose option was deleted keeps its charge as it is.
  rate_id := coalesce(rate, cur.shipping_rate_id);
  IF rate_id IS NULL THEN
    charge := cur.delivery_charge;
    rate_name := cur.shipping_name;
  ELSE
    SELECT * INTO ship FROM shipping_charge(store, rate_id, new_subtotal, (SELECT sum(q)::integer FROM unnest(qtys) q), variant_ids, rate_id = cur.shipping_rate_id);
    rate_name := ship.rate_name;
    charge := CASE WHEN rate_id IS DISTINCT FROM cur.shipping_rate_id OR ship.charge = 0 THEN ship.charge
      WHEN cur.delivery_charge > 0 THEN cur.delivery_charge ELSE ship.charge END;
  END IF;

  -- The coupon was already counted when the order was placed; only its amount follows the new subtotal.
  off := 0;
  IF cur.discount_code <> '' THEN
    SELECT d.kind, d.value INTO code FROM discounts d WHERE d.store_id = store AND d.code = cur.discount_code;
    off := CASE WHEN NOT FOUND THEN least(cur.discount, new_subtotal)
      WHEN code.kind = 'percent' THEN (new_subtotal * code.value) / 100 ELSE least(code.value, new_subtotal) END;
  END IF;

  WITH added AS (
    INSERT INTO order_items (store_id, order_id, variant_id, product_name, variant_label, price, quantity, stock_taken)
    SELECT store, target, w.vid, p.name, array_to_string(v.options, ' / '), coalesce(s.price, v.price), w.q, v.stock IS NOT NULL
    FROM unnest(variant_ids, qtys) w(vid, q)
    JOIN product_variants v ON v.id = w.vid JOIN products p ON p.id = v.product_id
    LEFT JOIN sold s ON s.variant_id = w.vid
    RETURNING id, variant_id
  )
  INSERT INTO order_item_costs (order_item_id, store_id, cost)
  SELECT added.id, store, coalesce(s.cost, c.cost) FROM added
  LEFT JOIN sold s ON s.variant_id = added.variant_id
  LEFT JOIN product_variant_costs c ON c.variant_id = added.variant_id
  WHERE coalesce(s.cost, c.cost) IS NOT NULL;

  UPDATE orders SET shipping_rate_id = rate_id, shipping_name = rate_name, subtotal = new_subtotal, delivery_charge = charge, discount = off,
    total = new_subtotal + charge - off, warehouse_id = ships_from, updated_at = now()
  WHERE id = target;

  SELECT string_agg(i.product_name || CASE WHEN i.variant_label <> '' THEN ' (' || i.variant_label || ')' ELSE '' END || ' × ' || i.quantity, ', ' ORDER BY i.product_name)
  INTO after FROM order_items i WHERE i.order_id = target;
  INSERT INTO order_events (store_id, order_id, user_id, kind, data)
  VALUES (store, target, current_user_id(), 'edited', jsonb_build_object('before', before, 'after', after,
    'fromShipping', cur.shipping_name, 'toShipping', rate_name, 'fromTotal', cur.total, 'toTotal', new_subtotal + charge - off));
  RETURN new_subtotal + charge - off;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION edit_order_lines FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION edit_order_lines TO uddokta_app;
--> statement-breakpoint
-- The storefront's view of a store's active options, in order, with what makes each free.
CREATE FUNCTION storefront_shipping(store uuid)
RETURNS TABLE (id uuid, name text, note text, price integer, free_over integer, free_min_qty integer, free_products uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id, r.name, r.note, r.price, r.free_over, r.free_min_qty,
    coalesce((SELECT array_agg(sp.product_id) FROM shipping_rate_products sp WHERE sp.rate_id = r.id), '{}')
  FROM shipping_rates r WHERE r.store_id = store AND r.active ORDER BY r.position, r.created_at, r.id
$$;
--> statement-breakpoint
DROP FUNCTION storefront_page(text, text);
--> statement-breakpoint
CREATE FUNCTION storefront_page(store_handle text, page_handle text)
RETURNS TABLE (store_id uuid, store_name text, theme text, page_id uuid, title text, seo_title text, seo_description text, content jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.name, s.theme, p.id,
    p.published_meta->>'title', p.published_meta->>'seoTitle', p.published_meta->>'seoDescription', p.published
  FROM pages p JOIN stores s ON s.id = p.store_id
  WHERE s.handle = store_handle AND p.published_meta->>'handle' = page_handle AND p.published IS NOT NULL
$$;
--> statement-breakpoint
DROP FUNCTION storefront_store(text);
--> statement-breakpoint
CREATE FUNCTION storefront_store(store_handle text)
RETURNS TABLE (id uuid, name text, theme text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, name, theme FROM stores WHERE handle = store_handle
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_store, storefront_page, storefront_shipping FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_store, storefront_page, storefront_shipping TO uddokta_app;
