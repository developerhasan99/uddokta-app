-- Notifications are written only by the triggers below, so every path is covered: the storefront, the team,
-- courier tracking and any future job. A member reads and marks as read only their own, in stores they belong to.
GRANT SELECT ON notifications TO uddokta_app;
--> statement-breakpoint
GRANT UPDATE (read_at) ON notifications TO uddokta_app;
--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notifications_own ON notifications FOR ALL TO uddokta_app
  USING (user_id = current_user_id() AND my_role(store_id) IS NOT NULL)
  WITH CHECK (user_id = current_user_id() AND my_role(store_id) IS NOT NULL);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_settings TO uddokta_app;
--> statement-breakpoint
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_settings_own ON notification_settings FOR ALL TO uddokta_app
  USING (user_id = current_user_id() AND my_role(store_id) IS NOT NULL)
  WITH CHECK (user_id = current_user_id() AND my_role(store_id) IS NOT NULL);
--> statement-breakpoint
-- On unless the member turned it off. Delivered orders are routine, so they start off.
CREATE FUNCTION notification_default(what text) RETURNS boolean LANGUAGE sql IMMUTABLE AS
  $$ SELECT what <> 'order_delivered' $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION notification_default TO uddokta_app;
--> statement-breakpoint
-- One row per member who wants it, except the person who caused it. Joining the team is for owners and admins only.
-- Old rows of the store are swept here, so no job is needed.
CREATE FUNCTION notify(store uuid, what text, payload jsonb, actor uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM notifications WHERE store_id = store AND created_at < now() - interval '90 days';
  INSERT INTO notifications (store_id, user_id, kind, data)
  SELECT m.store_id, m.user_id, what, payload
  FROM store_members m
  LEFT JOIN notification_settings s ON s.store_id = m.store_id AND s.user_id = m.user_id AND s.kind = what
  WHERE m.store_id = store
    AND m.user_id IS DISTINCT FROM actor
    AND (what <> 'member_joined' OR m.role IN ('owner', 'admin'))
    AND coalesce(s.enabled, notification_default(what));
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION notify FROM PUBLIC;
--> statement-breakpoint
-- Deferred to the end of the transaction, so the order's lines exist: the first product and the repeat-order mark
-- (same number and product within 24 hours, the rule the order page uses) go into the snapshot.
CREATE FUNCTION notify_new_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  o orders;
  first_product text;
  lines integer;
BEGIN
  SELECT * INTO o FROM orders WHERE id = NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT product_name, count(*) OVER () INTO first_product, lines FROM order_items WHERE order_id = o.id ORDER BY price * quantity DESC, product_name LIMIT 1;
  PERFORM notify(o.store_id, 'order_new', jsonb_build_object(
    'orderId', o.id, 'number', o.number, 'name', o.customer_name, 'total', o.total, 'source', o.source,
    'product', coalesce(first_product, ''), 'lines', coalesce(lines, 0),
    'duplicate', EXISTS (
      SELECT 1 FROM orders d JOIN order_items di ON di.order_id = d.id JOIN order_items oi ON oi.order_id = o.id AND oi.variant_id = di.variant_id
      WHERE d.store_id = o.store_id AND d.phone = o.phone AND d.id <> o.id AND abs(extract(epoch FROM d.created_at - o.created_at)) < 86400)
  ), current_user_id());
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER orders_notify_new AFTER INSERT ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION notify_new_order();
--> statement-breakpoint
CREATE FUNCTION notify_order_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM notify(NEW.store_id, 'order_' || NEW.status,
    jsonb_build_object('orderId', NEW.id, 'number', NEW.number, 'name', NEW.customer_name, 'total', NEW.total), current_user_id());
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_notify_status AFTER UPDATE OF status ON orders FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('delivered', 'returned'))
  EXECUTE FUNCTION notify_order_status();
--> statement-breakpoint
-- Fires when the total crosses the seller's alert level, or runs out, not on every sale below it.
CREATE FUNCTION notify_low_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  out_now boolean := NEW.stock = 0 AND OLD.stock > 0;
BEGIN
  IF out_now OR (NEW.low_stock IS NOT NULL AND NEW.stock <= NEW.low_stock AND OLD.stock > NEW.low_stock) THEN
    PERFORM notify(NEW.store_id, 'low_stock', jsonb_build_object(
      'productId', NEW.product_id, 'variantId', NEW.id, 'stock', NEW.stock, 'out', out_now,
      'product', (SELECT name FROM products WHERE id = NEW.product_id), 'variant', array_to_string(NEW.options, ' / ')
    ), current_user_id());
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_variants_notify_stock AFTER UPDATE OF stock ON product_variants FOR EACH ROW
  WHEN (NEW.stock IS NOT NULL AND OLD.stock IS NOT NULL AND NEW.stock < OLD.stock)
  EXECUTE FUNCTION notify_low_stock();
--> statement-breakpoint
CREATE FUNCTION notify_member_joined() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM notify(NEW.store_id, 'member_joined',
    jsonb_build_object('userId', NEW.user_id, 'name', (SELECT name FROM users WHERE id = NEW.user_id), 'role', NEW.role), NEW.user_id);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER store_members_notify_joined AFTER INSERT ON store_members FOR EACH ROW EXECUTE FUNCTION notify_member_joined();
--> statement-breakpoint
-- Someone who leaves the team takes nothing of the store with them, and starts fresh if they come back.
CREATE FUNCTION forget_member_notifications() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM notifications WHERE store_id = OLD.store_id AND user_id = OLD.user_id;
  DELETE FROM notification_settings WHERE store_id = OLD.store_id AND user_id = OLD.user_id;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER store_members_forget_notifications AFTER DELETE ON store_members FOR EACH ROW EXECUTE FUNCTION forget_member_notifications();
--> statement-breakpoint
-- Every storefront order saves a draft first, so a draft is news only once the buyer has left it for 15 minutes.
-- There is no job runner yet, so members' notification checks call this; the row lock makes each draft announce once.
-- ponytail: lazy check while someone has the dashboard open; move to a pg-boss job when workers are deployed.
CREATE FUNCTION notify_stale_drafts(store uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d record;
BEGIN
  IF my_role(store) IS NULL THEN RETURN; END IF;
  FOR d IN
    UPDATE checkout_drafts SET notified_at = now()
    WHERE store_id = store AND status = 'open' AND notified_at IS NULL
      AND updated_at < now() - interval '15 minutes' AND updated_at > now() - interval '2 days'
    RETURNING id, name, product_name
  LOOP
    PERFORM notify(store, 'checkout_draft', jsonb_build_object('draftId', d.id, 'name', d.name, 'product', d.product_name), NULL);
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION notify_stale_drafts FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION notify_stale_drafts TO uddokta_app;
--> statement-breakpoint
-- Drafts left before notifications existed are not announced.
UPDATE checkout_drafts SET notified_at = now() WHERE notified_at IS NULL;
