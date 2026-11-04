GRANT SELECT, INSERT, UPDATE, DELETE ON discounts TO uddokta_app;
--> statement-breakpoint
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Any member can see and make codes; only owners and admins can delete them.
CREATE POLICY discounts_read ON discounts FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY discounts_add ON discounts FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY discounts_change ON discounts FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY discounts_remove ON discounts FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
DROP FUNCTION place_order(uuid, uuid, uuid, integer, text, text, text, text, text);
--> statement-breakpoint
-- Every order goes through here. The database prices it: the variant's price, the store's delivery charge and the coupon,
-- takes stock by subtracting in place, records the warehouse and the buying price, and returns the number and total.
CREATE FUNCTION place_order(store uuid, page uuid, variant uuid, qty integer, buyer_name text, buyer_phone text, buyer_address text, buyer_area text,
  order_source text DEFAULT 'landing_page', coupon text DEFAULT '')
RETURNS TABLE (number integer, total integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  item record;
  code record;
  ships_from uuid;
  next_number integer;
  new_id uuid;
  item_id uuid;
  charge integer;
  subtotal integer;
  off integer := 0;
  applied text := '';
BEGIN
  IF qty NOT BETWEEN 1 AND 100 OR buyer_area NOT IN ('inside', 'outside')
    OR order_source NOT IN ('landing_page', 'website', 'messenger', 'whatsapp', 'phone', 'facebook_comment', 'instagram', 'shop', 'other')
    OR (order_source IN ('landing_page', 'website') AND qty > 20) THEN
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
  subtotal := item.price * qty;

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

  IF item.stock IS NULL THEN
    SELECT id INTO ships_from FROM warehouses WHERE store_id = store ORDER BY created_at, id LIMIT 1;
  ELSE
    UPDATE warehouse_stock SET quantity = quantity - qty
    WHERE variant_id = variant AND quantity >= qty
      AND warehouse_id = (SELECT warehouse_id FROM warehouse_stock WHERE variant_id = variant AND quantity >= qty ORDER BY quantity DESC, warehouse_id LIMIT 1)
    RETURNING warehouse_id INTO ships_from;
    IF ships_from IS NULL THEN RAISE EXCEPTION 'sold out' USING ERRCODE = 'UD011'; END IF;
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
  INSERT INTO order_items (store_id, order_id, variant_id, product_name, variant_label, price, quantity, stock_taken)
  VALUES (store, new_id, variant, item.name, item.label, item.price, qty, item.stock IS NOT NULL)
  RETURNING id INTO item_id;
  INSERT INTO order_item_costs (order_item_id, store_id, cost)
  SELECT item_id, store, cost FROM product_variant_costs WHERE variant_id = variant;
  RETURN QUERY SELECT next_number, subtotal + charge - off;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION place_order FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION place_order TO uddokta_app;
