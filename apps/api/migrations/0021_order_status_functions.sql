ALTER TABLE orders ADD CONSTRAINT orders_note_length CHECK (length(note) <= 2000);
--> statement-breakpoint
-- Orders placed before stock_taken existed: they took stock if their warehouse tracks the variant.
UPDATE order_items i SET stock_taken = true FROM orders o
WHERE o.id = i.order_id AND EXISTS (SELECT 1 FROM warehouse_stock ws WHERE ws.variant_id = i.variant_id AND ws.warehouse_id = o.warehouse_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION place_order(store uuid, page uuid, variant uuid, qty integer, buyer_name text, buyer_phone text, buyer_address text, buyer_area text, charge integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  item record;
  ships_from uuid;
  next_number integer;
  new_id uuid;
BEGIN
  IF qty NOT BETWEEN 1 AND 20 OR charge NOT BETWEEN 0 AND 100000 OR buyer_area NOT IN ('inside', 'outside') THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
  IF page IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pages WHERE id = page AND store_id = store AND published IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid order' USING ERRCODE = 'UD010';
  END IF;
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
  SELECT COALESCE(MAX(number), 1000) + 1 INTO next_number FROM orders WHERE store_id = store;
  INSERT INTO orders (store_id, number, customer_name, phone, address, area, subtotal, delivery_charge, total, source, page_id, warehouse_id)
  VALUES (store, next_number, buyer_name, buyer_phone, buyer_address, buyer_area, item.price * qty, charge, item.price * qty + charge, 'landing_page', page, ships_from)
  RETURNING id INTO new_id;
  INSERT INTO order_items (store_id, order_id, variant_id, product_name, variant_label, price, quantity, stock_taken)
  VALUES (store, new_id, variant, item.name, item.label, item.price, qty, item.stock IS NOT NULL);
  RETURN next_number;
END $$;
--> statement-breakpoint
-- Moves an order along its life. Runs as the signed-in member, so row-level security still applies.
-- Cancelling or a return puts back the stock the sale took, by adding in place, into the warehouse it shipped from.
CREATE FUNCTION set_order_status(target uuid, next text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  current text;
  allowed text[];
BEGIN
  SELECT status INTO current FROM orders WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no order' USING ERRCODE = 'UD013'; END IF;
  allowed := CASE current
    WHEN 'new' THEN ARRAY['confirmed', 'hold', 'cancelled']
    WHEN 'hold' THEN ARRAY['confirmed', 'cancelled']
    WHEN 'confirmed' THEN ARRAY['packed', 'hold', 'cancelled']
    WHEN 'packed' THEN ARRAY['courier', 'cancelled']
    WHEN 'courier' THEN ARRAY['delivered', 'returned']
    ELSE ARRAY[]::text[]
  END;
  IF NOT next = ANY (allowed) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = 'UD012'; END IF;

  IF next IN ('cancelled', 'returned') THEN
    -- Only rows still tracked: if the seller stopped tracking this variant, there is nothing to put back.
    UPDATE warehouse_stock ws SET quantity = ws.quantity + i.quantity
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE i.order_id = target AND i.stock_taken AND ws.variant_id = i.variant_id AND ws.warehouse_id = o.warehouse_id;
    UPDATE order_items SET stock_taken = false WHERE order_id = target;
  END IF;
  UPDATE orders SET status = next, updated_at = now() WHERE id = target;
END $$;
