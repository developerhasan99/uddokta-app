-- Changing an order's products or delivery area before it is packed. Like place_order_lines, the database does the money and the stock:
-- it puts back what the order took, prices the new lines (a product already in the order keeps the price it was sold at),
-- takes stock from one warehouse that holds every tracked line, recalculates the delivery charge if the area changed, and the coupon.
-- SECURITY DEFINER because buying prices are hidden from staff; the API has already loaded the order as a member of its store.
CREATE FUNCTION edit_order_lines(store uuid, target uuid, lines jsonb, buyer_area text)
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
  new_subtotal integer;
  off integer;
  code record;
  before text;
  after text;
BEGIN
  IF jsonb_typeof(lines) <> 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 20 OR buyer_area NOT IN ('inside', 'outside')
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

  -- Same area: the charge the customer agreed to stays. A new area takes the store's current charge.
  IF buyer_area = cur.area THEN charge := cur.delivery_charge;
  ELSE SELECT CASE WHEN buyer_area = 'outside' THEN delivery_outside ELSE delivery_inside END INTO charge FROM stores WHERE id = store;
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

  UPDATE orders SET area = buyer_area, subtotal = new_subtotal, delivery_charge = charge, discount = off,
    total = new_subtotal + charge - off, warehouse_id = ships_from, updated_at = now()
  WHERE id = target;

  SELECT string_agg(i.product_name || CASE WHEN i.variant_label <> '' THEN ' (' || i.variant_label || ')' ELSE '' END || ' × ' || i.quantity, ', ' ORDER BY i.product_name)
  INTO after FROM order_items i WHERE i.order_id = target;
  INSERT INTO order_events (store_id, order_id, user_id, kind, data)
  VALUES (store, target, current_user_id(), 'edited', jsonb_build_object('before', before, 'after', after,
    'fromArea', cur.area, 'toArea', buyer_area, 'fromTotal', cur.total, 'toTotal', new_subtotal + charge - off));
  RETURN new_subtotal + charge - off;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION edit_order_lines FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION edit_order_lines TO uddokta_app;
