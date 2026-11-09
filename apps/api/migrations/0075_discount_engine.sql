-- Discount products: members read and change them with their discount; the database checks they belong to the store.
GRANT SELECT, INSERT, DELETE ON discount_products TO uddokta_app;
--> statement-breakpoint
ALTER TABLE discount_products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY discount_products_member ON discount_products FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
-- Orders placed with a coupon before discounts had ids point at it now, for edits and once-per-phone.
UPDATE orders o SET discount_id = d.id FROM discounts d WHERE o.discount_code <> '' AND d.store_id = o.store_id AND d.code = o.discount_code;
--> statement-breakpoint
-- How much one discount takes off these lines (variant, quantity and unit price in the same order) with this delivery charge.
-- Zero when its minimums are not met. Never more than the order. The only place discount amounts are worked out.
CREATE FUNCTION discount_amount(d discounts, variant_ids uuid[], qtys integer[], prices integer[], charge integer) RETURNS integer
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  sub integer;
  units integer;
  amt integer := 0;
  esub integer;
  eunits integer;
  u_price integer[];
  u_buy boolean[];
  u_get boolean[];
  n integer;
  top integer;
  need integer;
  picked integer;
  saved integer;
  buys integer;
BEGIN
  SELECT coalesce(sum(x.p * x.q), 0), coalesce(sum(x.q), 0) INTO sub, units FROM unnest(prices, qtys) x(p, q);
  IF sub < d.min_subtotal OR units < d.min_qty THEN RETURN 0; END IF;
  IF d.type = 'order' THEN
    amt := CASE WHEN d.kind = 'percent' THEN sub * d.value / 100 ELSE least(d.value, sub) END;
  ELSIF d.type = 'shipping' THEN
    amt := charge;
  ELSIF d.type = 'products' THEN
    SELECT coalesce(sum(x.p * x.q), 0), coalesce(sum(x.q), 0) INTO esub, eunits
    FROM unnest(variant_ids, qtys, prices) x(vid, q, p) JOIN product_variants v ON v.id = x.vid
    WHERE d.applies_all OR EXISTS (SELECT 1 FROM discount_products dp WHERE dp.discount_id = d.id AND dp.role = 'get' AND dp.product_id = v.product_id);
    -- A fixed amount comes off each qualifying item, as buyers read "৳50 off".
    amt := CASE WHEN d.kind = 'percent' THEN esub * d.value / 100 ELSE least(d.value * eunits, esub) END;
  ELSE
    -- Buy X get Y. Every unit is listed cheapest first; the cheapest qualifying units are the ones given at a discount,
    -- and the rest must still hold enough units to buy. The most times that fits (up to max_per_order) wins.
    SELECT array_agg(u.p ORDER BY u.p, u.vid), array_agg(u.is_buy ORDER BY u.p, u.vid), array_agg(u.is_get ORDER BY u.p, u.vid)
    INTO u_price, u_buy, u_get
    FROM (SELECT x.vid, x.p,
        d.buys_all OR EXISTS (SELECT 1 FROM discount_products dp WHERE dp.discount_id = d.id AND dp.role = 'buy' AND dp.product_id = v.product_id) AS is_buy,
        d.applies_all OR EXISTS (SELECT 1 FROM discount_products dp WHERE dp.discount_id = d.id AND dp.role = 'get' AND dp.product_id = v.product_id) AS is_get
      FROM unnest(variant_ids, qtys, prices) x(vid, q, p) JOIN product_variants v ON v.id = x.vid CROSS JOIN generate_series(1, x.q)) u;
    n := coalesce(cardinality(u_price), 0);
    top := least(coalesce(d.max_per_order, 100), n / (d.buy_qty + d.get_qty));
    FOR k IN REVERSE top..1 LOOP
      need := k * d.get_qty;
      picked := 0;
      saved := 0;
      buys := 0;
      FOR i IN 1..n LOOP
        IF u_get[i] AND picked < need THEN
          picked := picked + 1;
          saved := saved + u_price[i];
        ELSIF u_buy[i] THEN
          buys := buys + 1;
        END IF;
      END LOOP;
      IF picked = need AND buys >= k * d.buy_qty THEN
        amt := saved * d.value / 100;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN greatest(0, least(amt, sub + charge));
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION discount_amount FROM PUBLIC;
--> statement-breakpoint
-- One discount per order: a typed code, or the automatic discounts that are running. The one that saves the buyer most wins.
-- A typed code that is unknown, not running or not met is refused (UD016). The winner's use is counted in the statement
-- that checks its limit, so two buyers cannot take the last use together.
CREATE FUNCTION pick_discount(store uuid, coupon text, variant_ids uuid[], qtys integer[], prices integer[], charge integer, buyer_phone text)
RETURNS TABLE (id uuid, label text, amount integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d discounts;
  typed text := upper(btrim(coalesce(coupon, '')));
  code_found boolean := false;
  amt integer;
  best integer := 0;
  best_id uuid;
  best_label text := '';
  best_is_code boolean := false;
BEGIN
  FOR d IN SELECT * FROM discounts x
    WHERE x.store_id = store AND x.active AND x.starts_at <= now() AND (x.ends_at IS NULL OR x.ends_at > now())
      AND (x.max_uses IS NULL OR x.uses < x.max_uses)
      AND (x.code IS NULL OR (typed <> '' AND x.code = typed))
      AND NOT (x.once_per_phone AND EXISTS (SELECT 1 FROM orders o WHERE o.store_id = store AND o.phone = buyer_phone AND o.discount_id = x.id AND o.status <> 'cancelled'))
  LOOP
    amt := discount_amount(d, variant_ids, qtys, prices, charge);
    IF d.code IS NOT NULL THEN
      code_found := true;
      IF amt = 0 THEN RAISE EXCEPTION 'coupon' USING ERRCODE = 'UD016'; END IF;
    END IF;
    IF amt > best OR (amt = best AND amt > 0 AND d.code IS NOT NULL) THEN
      best := amt;
      best_id := d.id;
      best_label := coalesce(d.code, d.title);
      best_is_code := d.code IS NOT NULL;
    END IF;
  END LOOP;
  IF typed <> '' AND NOT code_found THEN RAISE EXCEPTION 'coupon' USING ERRCODE = 'UD016'; END IF;
  IF best_id IS NOT NULL THEN
    UPDATE discounts x SET uses = x.uses + 1 WHERE x.id = best_id AND (x.max_uses IS NULL OR x.uses < x.max_uses);
    IF NOT FOUND THEN
      IF best_is_code THEN RAISE EXCEPTION 'coupon' USING ERRCODE = 'UD016'; END IF;
      RETURN QUERY SELECT NULL::uuid, ''::text, 0;
      RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT best_id, best_label, best;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION pick_discount FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION place_order_lines(store uuid, page uuid, lines jsonb, buyer_name text, buyer_phone text, buyer_address text, rate uuid,
  order_source text DEFAULT 'landing_page', coupon text DEFAULT '')
RETURNS TABLE (number integer, total integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  variant_ids uuid[];
  qtys integer[];
  priced integer;
  tracked integer;
  taken integer;
  prices integer[];
  chosen record;
  ships_from uuid;
  next_number integer;
  new_id uuid;
  ship record;
  subtotal integer;
  off integer := 0;
  applied text := '';
  applied_id uuid;
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
  SELECT array_agg(v.price ORDER BY w.ord) INTO prices FROM unnest(variant_ids) WITH ORDINALITY w(vid, ord) JOIN product_variants v ON v.id = w.vid;
  SELECT * INTO ship FROM shipping_charge(store, rate, subtotal, (SELECT sum(q)::integer FROM unnest(qtys) q), variant_ids);

  -- The typed code or the best automatic discount, with its use already counted (pick_discount).
  SELECT * INTO chosen FROM pick_discount(store, coupon, variant_ids, qtys, prices, ship.charge, buyer_phone);
  off := chosen.amount;
  applied := chosen.label;
  applied_id := chosen.id;

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
  INSERT INTO orders (store_id, number, customer_name, phone, address, shipping_rate_id, shipping_name, subtotal, delivery_charge, discount, discount_code, discount_id, total, source, page_id, warehouse_id)
  VALUES (store, next_number, buyer_name, buyer_phone, buyer_address, rate, ship.rate_name, subtotal, ship.charge, off, applied, applied_id, subtotal + ship.charge - off, order_source, page, ships_from)
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
CREATE OR REPLACE FUNCTION edit_order_lines(store uuid, target uuid, lines jsonb, rate uuid)
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
  d discounts;
  prices integer[];
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
  SELECT array_agg(coalesce(s.price, v.price) ORDER BY w.ord) INTO prices
  FROM unnest(variant_ids) WITH ORDINALITY w(vid, ord) JOIN product_variants v ON v.id = w.vid LEFT JOIN sold s ON s.variant_id = w.vid;

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

  -- The discount was counted when the order was placed; its amount follows the new lines by the same rule, whatever its
  -- dates or limits now say. A discount deleted since keeps what was agreed, never more than the new order.
  off := 0;
  IF cur.discount_id IS NOT NULL THEN
    SELECT * INTO d FROM discounts x WHERE x.id = cur.discount_id AND x.store_id = store;
  END IF;
  IF d.id IS NOT NULL THEN
    off := discount_amount(d, variant_ids, qtys, prices, charge);
  ELSIF cur.discount_code <> '' THEN
    off := least(cur.discount, new_subtotal + charge);
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
-- The automatic offers running for a product, for its order form: titles only, as the seller wrote them.
CREATE FUNCTION storefront_offers(store uuid, product uuid) RETURNS TABLE (title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.title FROM discounts d
  WHERE d.store_id = store AND d.code IS NULL AND d.active AND d.starts_at <= now() AND (d.ends_at IS NULL OR d.ends_at > now())
    AND (d.max_uses IS NULL OR d.uses < d.max_uses)
    AND (d.type IN ('order', 'shipping')
      OR (d.applies_all AND (d.type <> 'bxgy' OR d.buys_all))
      OR EXISTS (SELECT 1 FROM discount_products dp WHERE dp.discount_id = d.id AND dp.product_id = product)
      OR (d.type = 'bxgy' AND (d.applies_all OR d.buys_all)))
  ORDER BY d.created_at
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_offers FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_offers TO uddokta_app;
