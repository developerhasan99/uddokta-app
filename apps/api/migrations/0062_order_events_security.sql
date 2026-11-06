-- The activity log is written by triggers on orders and shipments, so every path that changes an order is recorded:
-- the storefront, the team, courier tracking and any future job. The team can read it and add comments as themselves;
-- nobody can edit or delete an entry through the app.
GRANT SELECT, INSERT ON order_events TO uddokta_app;
--> statement-breakpoint
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY order_events_read ON order_events FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY order_events_comment ON order_events FOR INSERT TO uddokta_app
  WITH CHECK (my_role(store_id) IS NOT NULL AND kind = 'comment' AND user_id = current_user_id());
--> statement-breakpoint
-- The name is copied when the entry is written, so the log reads the same after someone leaves or renames themselves.
CREATE FUNCTION order_event_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.user_name := coalesce((SELECT name FROM users WHERE id = NEW.user_id), '');
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_events_name BEFORE INSERT ON order_events FOR EACH ROW EXECUTE FUNCTION order_event_name();
--> statement-breakpoint
CREATE FUNCTION log_order_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  who uuid := current_user_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_events (store_id, order_id, user_id, kind, data)
    VALUES (NEW.store_id, NEW.id, who, 'placed', jsonb_build_object('source', NEW.source, 'total', NEW.total));
    RETURN NEW;
  END IF;
  IF NEW.status <> OLD.status THEN
    INSERT INTO order_events (store_id, order_id, user_id, kind, data) VALUES (NEW.store_id, NEW.id, who, 'status', jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF (NEW.customer_name, NEW.phone, NEW.address) IS DISTINCT FROM (OLD.customer_name, OLD.phone, OLD.address) THEN
    INSERT INTO order_events (store_id, order_id, user_id, kind, data) VALUES (NEW.store_id, NEW.id, who, 'contact',
      jsonb_build_object('name', NEW.customer_name, 'phone', NEW.phone, 'address', NEW.address));
  END IF;
  IF NEW.note <> OLD.note THEN
    INSERT INTO order_events (store_id, order_id, user_id, kind, data) VALUES (NEW.store_id, NEW.id, who, 'note', jsonb_build_object('note', NEW.note));
  END IF;
  IF NEW.tags <> OLD.tags THEN
    INSERT INTO order_events (store_id, order_id, user_id, kind, data) VALUES (NEW.store_id, NEW.id, who, 'tags', jsonb_build_object('tags', to_jsonb(NEW.tags)));
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_log AFTER INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION log_order_change();
--> statement-breakpoint
CREATE FUNCTION log_shipment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO order_events (store_id, order_id, user_id, kind, data)
  VALUES (NEW.store_id, NEW.order_id, current_user_id(), 'shipped', jsonb_build_object('courier', NEW.courier, 'tracking', NEW.tracking_code));
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER shipments_log AFTER INSERT ON shipments FOR EACH ROW EXECUTE FUNCTION log_shipment();
--> statement-breakpoint
-- Orders placed before the log existed get their "placed" entry, with no name: who placed them was not recorded.
INSERT INTO order_events (store_id, order_id, kind, data, created_at)
SELECT store_id, id, 'placed', jsonb_build_object('source', source, 'total', total), created_at FROM orders;
