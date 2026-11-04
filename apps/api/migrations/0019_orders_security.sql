-- Deleting a page, warehouse or variant keeps the order and forgets only that link.
ALTER TABLE orders ADD CONSTRAINT orders_page_fk FOREIGN KEY (store_id, page_id) REFERENCES pages (store_id, id) ON DELETE SET NULL (page_id);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_warehouse_fk FOREIGN KEY (store_id, warehouse_id) REFERENCES warehouses (store_id, id) ON DELETE SET NULL (warehouse_id);
--> statement-breakpoint
ALTER TABLE order_items ADD CONSTRAINT order_items_variant_fk FOREIGN KEY (store_id, variant_id) REFERENCES product_variants (store_id, id) ON DELETE SET NULL (variant_id);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_text_lengths CHECK (length(customer_name) BETWEEN 1 AND 100 AND length(phone) BETWEEN 1 AND 20 AND length(address) BETWEEN 1 AND 500);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON orders, order_items TO uddokta_app;
--> statement-breakpoint
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Any team member works on orders; only owners and admins can delete them.
CREATE POLICY orders_read ON orders FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY orders_add ON orders FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY orders_change ON orders FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY orders_remove ON orders FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
CREATE POLICY order_items_member ON order_items FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
-- A buyer's order from the storefront. Prices come from the variant here, stock is taken by subtracting in place
-- (never by writing back a number read earlier), and the order records the warehouse it ships from.
-- The delivery charge is the seller's, read by the storefront from the published page.
CREATE FUNCTION place_order(store uuid, page uuid, variant uuid, qty integer, buyer_name text, buyer_phone text, buyer_address text, buyer_area text, charge integer)
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

  -- Per-store order numbers start at 1001, one at a time per store.
  PERFORM pg_advisory_xact_lock(hashtext('orders:' || store));
  SELECT COALESCE(MAX(number), 1000) + 1 INTO next_number FROM orders WHERE store_id = store;
  INSERT INTO orders (store_id, number, customer_name, phone, address, area, subtotal, delivery_charge, total, source, page_id, warehouse_id)
  VALUES (store, next_number, buyer_name, buyer_phone, buyer_address, buyer_area, item.price * qty, charge, item.price * qty + charge, 'landing_page', page, ships_from)
  RETURNING id INTO new_id;
  INSERT INTO order_items (store_id, order_id, variant_id, product_name, variant_label, price, quantity)
  VALUES (store, new_id, variant, item.name, item.label, item.price, qty);
  RETURN next_number;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION place_order FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION place_order TO uddokta_app;
