GRANT SELECT, INSERT, UPDATE, DELETE ON warehouse_stock TO uddokta_app;
--> statement-breakpoint
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY warehouse_stock_member ON warehouse_stock FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
-- Every store has a warehouse from now on. Stores already using one keep it.
INSERT INTO warehouses (store_id, name)
SELECT s.id, 'প্রধান গুদাম' FROM stores s WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.store_id = s.id);
--> statement-breakpoint
-- Existing stock moves to each store's oldest warehouse. Blank stays blank, so it stays untracked.
INSERT INTO warehouse_stock (store_id, warehouse_id, variant_id, quantity)
SELECT v.store_id, w.id, v.id, v.stock
FROM product_variants v
CROSS JOIN LATERAL (SELECT id FROM warehouses WHERE store_id = v.store_id ORDER BY created_at, id LIMIT 1) w
WHERE v.stock IS NOT NULL;
--> statement-breakpoint
-- The variant's stock is always the total, and no rows means not tracked.
CREATE FUNCTION sync_variant_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  changed uuid := COALESCE(NEW.variant_id, OLD.variant_id);
BEGIN
  UPDATE product_variants
  SET stock = (SELECT CASE WHEN COUNT(*) > 0 THEN LEAST(SUM(quantity), 2000000000)::int END FROM warehouse_stock WHERE variant_id = changed)
  WHERE id = changed;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER warehouse_stock_sync AFTER INSERT OR UPDATE OR DELETE ON warehouse_stock
FOR EACH ROW EXECUTE FUNCTION sync_variant_stock();
