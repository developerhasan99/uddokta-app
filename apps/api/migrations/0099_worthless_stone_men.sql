ALTER TABLE "plans" DROP COLUMN "custom_domain";--> statement-breakpoint
-- The plan a store is on now, with its tools: its own (or its custom plan) while paid or with no end date, else the default.
DROP FUNCTION store_limits(uuid);--> statement-breakpoint
CREATE FUNCTION store_limits(store uuid) RETURNS TABLE (plan_id uuid, plan_name text, plan_until date, price_bdt integer, is_custom boolean, billing_note text,
  max_landing_pages integer, storage_mb integer, max_members integer, max_products integer, features text[], custom_domain boolean, suspended boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.name, CASE WHEN p.id = s.plan_id THEN s.plan_until END, p.price_bdt, p.store_id IS NOT NULL, p.billing_note,
    p.max_landing_pages, p.storage_mb, p.max_members, p.max_products, p.features, 'customDomain' = ANY (p.features), s.suspended_at IS NOT NULL
  FROM stores s JOIN plans p ON p.id = CASE WHEN s.plan_id IS NOT NULL AND (s.plan_until IS NULL OR s.plan_until >= current_date) THEN s.plan_id ELSE (SELECT id FROM plans WHERE is_default) END
  WHERE s.id = store
$$;--> statement-breakpoint
-- What the storefront needs before drawing anything: whether the store is open, and whether it has an online store.
CREATE FUNCTION storefront_store_state(store_handle text) RETURNS TABLE (suspended boolean, online_store boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.suspended_at IS NOT NULL, 'onlineStore' = ANY (l.features) FROM stores s, store_limits(s.id) l WHERE s.handle = store_handle
$$;--> statement-breakpoint
-- A store's own Billing page: its plan and tools, what it uses, its payments, the plans on offer and how to pay.
-- The API shows it to owners and admins only.
CREATE FUNCTION store_billing(store uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'plan', (SELECT to_jsonb(l) - 'suspended' FROM store_limits(store) l),
    'paidPlanEnded', (SELECT s.plan_id IS NOT NULL AND s.plan_until < current_date FROM stores s WHERE s.id = store),
    'usage', jsonb_build_object(
      'products', (SELECT count(*) FROM products WHERE store_id = store),
      'landingPages', (SELECT count(*) FROM pages WHERE store_id = store),
      'members', (SELECT count(*) FROM store_members WHERE store_id = store) + (SELECT count(*) FROM store_invites WHERE store_id = store AND expires_at > now()),
      'storageBytes', (SELECT coalesce(sum(size_bytes), 0) FROM media WHERE store_id = store)),
    'payments', (SELECT coalesce(jsonb_agg(jsonb_build_object('amount', p.amount, 'months', p.months, 'method', p.method, 'reference', p.reference, 'plan', pl.name, 'at', p.created_at) ORDER BY p.created_at DESC), '[]')
      FROM store_payments p LEFT JOIN plans pl ON pl.id = p.plan_id WHERE p.store_id = store),
    'plans', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'priceBdt', p.price_bdt, 'isDefault', p.is_default, 'maxLandingPages', p.max_landing_pages,
        'storageMb', p.storage_mb, 'maxMembers', p.max_members, 'maxProducts', p.max_products, 'features', p.features) ORDER BY p.price_bdt, p.name), '[]')
      FROM plans p WHERE p.store_id IS NULL AND NOT p.archived),
    'pay', (SELECT jsonb_build_object('whatsapp', billing_whatsapp, 'bkash', billing_bkash, 'nagad', billing_nagad, 'bank', billing_bank, 'note', billing_note) FROM platform_settings WHERE id = 1))
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION console_plans(admin uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'priceBdt', p.price_bdt, 'isDefault', p.is_default, 'maxLandingPages', p.max_landing_pages,
    'storageMb', p.storage_mb, 'maxMembers', p.max_members, 'maxProducts', p.max_products, 'features', p.features, 'billingNote', p.billing_note, 'archived', p.archived,
    'stores', (SELECT count(*) FROM stores s WHERE s.plan_id = p.id)) ORDER BY p.archived, p.price_bdt, p.name), '[]') FROM plans p WHERE p.store_id IS NULL);
END $$;--> statement-breakpoint
-- Creates (null id) or changes a public plan. Making one the default takes it from the old one; the default cannot be archived.
CREATE OR REPLACE FUNCTION console_save_plan(admin uuid, plan uuid, details jsonb, why text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  saved uuid;
  tools text[] := ARRAY(SELECT jsonb_array_elements_text(details->'features'));
BEGIN
  PERFORM console_check(admin);
  IF plan IS NOT NULL AND EXISTS (SELECT 1 FROM plans WHERE id = plan AND store_id IS NOT NULL) THEN RAISE EXCEPTION 'custom plans are changed on their store' USING ERRCODE = 'UD100'; END IF;
  IF (details->>'isDefault')::boolean THEN UPDATE plans SET is_default = false WHERE is_default AND id IS DISTINCT FROM plan; END IF;
  IF plan IS NULL THEN
    INSERT INTO plans (name, price_bdt, is_default, max_landing_pages, storage_mb, max_members, max_products, features, billing_note, archived)
    VALUES (details->>'name', (details->>'priceBdt')::integer, (details->>'isDefault')::boolean, (details->>'maxLandingPages')::integer, (details->>'storageMb')::integer,
      (details->>'maxMembers')::integer, (details->>'maxProducts')::integer, tools, coalesce(details->>'billingNote', ''), (details->>'archived')::boolean)
    RETURNING id INTO saved;
  ELSE
    UPDATE plans SET name = details->>'name', price_bdt = (details->>'priceBdt')::integer, is_default = (details->>'isDefault')::boolean,
      max_landing_pages = (details->>'maxLandingPages')::integer, storage_mb = (details->>'storageMb')::integer, max_members = (details->>'maxMembers')::integer,
      max_products = (details->>'maxProducts')::integer, features = tools, billing_note = coalesce(details->>'billingNote', ''), archived = (details->>'archived')::boolean
    WHERE id = plan RETURNING id INTO saved;
    IF saved IS NULL THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plans WHERE is_default) THEN RAISE EXCEPTION 'one plan must be the default' USING ERRCODE = 'UD102'; END IF;
  PERFORM console_log(admin, CASE WHEN plan IS NULL THEN 'plan.create' ELSE 'plan.update' END, 'plan', saved, details->>'name', details, why);
  RETURN saved;
END $$;--> statement-breakpoint
-- Puts a store on its own custom plan (made from details, or changed if it has one) until a date (null: no end).
CREATE FUNCTION console_save_custom_plan(admin uuid, store uuid, details jsonb, until date, why text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
  saved uuid;
  tools text[] := ARRAY(SELECT jsonb_array_elements_text(details->'features'));
BEGIN
  PERFORM console_check(admin);
  SELECT * INTO target FROM stores WHERE id = store FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such store' USING ERRCODE = 'UD100'; END IF;
  INSERT INTO plans (name, price_bdt, max_landing_pages, storage_mb, max_members, max_products, features, billing_note, store_id)
  VALUES ('Custom · ' || target.handle, (details->>'priceBdt')::integer, (details->>'maxLandingPages')::integer, (details->>'storageMb')::integer,
    (details->>'maxMembers')::integer, (details->>'maxProducts')::integer, tools, coalesce(details->>'billingNote', ''), store)
  ON CONFLICT (store_id) WHERE store_id IS NOT NULL DO UPDATE SET price_bdt = excluded.price_bdt, max_landing_pages = excluded.max_landing_pages,
    storage_mb = excluded.storage_mb, max_members = excluded.max_members, max_products = excluded.max_products, features = excluded.features, billing_note = excluded.billing_note
  RETURNING id INTO saved;
  UPDATE stores SET plan_id = saved, plan_until = until WHERE id = store;
  PERFORM console_log(admin, 'store.customPlan', 'store', store, target.name || ' (' || target.handle || ')', details || jsonb_build_object('until', until), why);
  RETURN saved;
END $$;--> statement-breakpoint
-- Ends a store's custom plan: the store goes back to the default plan; recorded payments stay.
CREATE FUNCTION console_end_custom_plan(admin uuid, store uuid, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
BEGIN
  PERFORM console_check(admin);
  SELECT * INTO target FROM stores WHERE id = store FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such store' USING ERRCODE = 'UD100'; END IF;
  UPDATE stores SET plan_id = NULL, plan_until = NULL WHERE id = store AND plan_id IN (SELECT id FROM plans WHERE store_id = store);
  DELETE FROM plans WHERE store_id = store;
  PERFORM console_log(admin, 'store.customPlanEnd', 'store', store, target.name || ' (' || target.handle || ')', '{}', why);
END $$;--> statement-breakpoint
-- Public plans only, or this store's own custom plan.
CREATE OR REPLACE FUNCTION console_set_plan(admin uuid, store uuid, plan uuid, until date, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
BEGIN
  PERFORM console_check(admin);
  IF plan IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plans WHERE id = plan AND NOT archived AND (store_id IS NULL OR store_id = store)) THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  UPDATE stores SET plan_id = plan, plan_until = CASE WHEN plan IS NULL THEN NULL ELSE until END WHERE id = store RETURNING * INTO target;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such store' USING ERRCODE = 'UD100'; END IF;
  PERFORM console_log(admin, 'store.plan', 'store', store, target.name || ' (' || target.handle || ')',
    jsonb_build_object('plan', (SELECT name FROM plans WHERE id = plan), 'until', until), why);
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION console_record_payment(admin uuid, store uuid, plan uuid, paid integer, paid_months integer, paid_by text, ref text, why text) RETURNS date
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
  ends date;
BEGIN
  PERFORM console_check(admin);
  IF NOT EXISTS (SELECT 1 FROM plans WHERE id = plan AND NOT archived AND (store_id IS NULL OR store_id = store)) THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  SELECT * INTO target FROM stores WHERE id = store FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such store' USING ERRCODE = 'UD100'; END IF;
  ends := (CASE WHEN target.plan_id = plan AND target.plan_until >= current_date THEN target.plan_until ELSE current_date END + make_interval(months => paid_months))::date;
  INSERT INTO store_payments (store_id, plan_id, amount, months, method, reference, recorded_by) VALUES (store, plan, paid, paid_months, paid_by, coalesce(btrim(ref), ''), admin);
  UPDATE stores SET plan_id = plan, plan_until = ends WHERE id = store;
  PERFORM console_log(admin, 'store.payment', 'store', store, target.name || ' (' || target.handle || ')',
    jsonb_build_object('plan', (SELECT name FROM plans WHERE id = plan), 'amount', paid, 'months', paid_months, 'method', paid_by, 'reference', ref, 'until', ends), why);
  RETURN ends;
END $$;--> statement-breakpoint
-- The store page in the console now also carries its custom plan, if it has one.
CREATE OR REPLACE FUNCTION console_store(admin uuid, store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'domain', CASE WHEN s.domain_live_at IS NOT NULL THEN s.domain END,
    'createdAt', s.created_at, 'suspendedAt', s.suspended_at, 'suspendReason', coalesce(s.suspend_reason, ''),
    'planId', s.plan_id, 'planUntil', s.plan_until, 'limits', (SELECT to_jsonb(l) FROM store_limits(s.id) l),
    'customPlan', (SELECT jsonb_build_object('id', p.id, 'priceBdt', p.price_bdt, 'maxLandingPages', p.max_landing_pages, 'storageMb', p.storage_mb, 'maxMembers', p.max_members,
      'maxProducts', p.max_products, 'features', p.features, 'billingNote', p.billing_note) FROM plans p WHERE p.store_id = s.id),
    'counts', jsonb_build_object('products', (SELECT count(*) FROM products p WHERE p.store_id = s.id), 'orders', (SELECT count(*) FROM orders o WHERE o.store_id = s.id),
      'orders30', (SELECT count(*) FROM orders o WHERE o.store_id = s.id AND o.created_at > now() - interval '30 days'),
      'landingPages', (SELECT count(*) FROM pages p WHERE p.store_id = s.id), 'storageBytes', (SELECT coalesce(sum(m.size_bytes), 0) FROM media m WHERE m.store_id = s.id)),
    'members', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', m.role) ORDER BY m.created_at), '[]') FROM store_members m JOIN users u ON u.id = m.user_id WHERE m.store_id = s.id),
    'payments', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'months', p.months, 'method', p.method, 'reference', p.reference, 'plan', pl.name, 'by', u.email, 'at', p.created_at) ORDER BY p.created_at DESC), '[]')
      FROM store_payments p LEFT JOIN plans pl ON pl.id = p.plan_id LEFT JOIN users u ON u.id = p.recorded_by WHERE p.store_id = s.id))
  FROM stores s WHERE s.id = store);
END $$;--> statement-breakpoint
CREATE FUNCTION console_settings(admin uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN (SELECT jsonb_build_object('whatsapp', billing_whatsapp, 'bkash', billing_bkash, 'nagad', billing_nagad, 'bank', billing_bank, 'note', billing_note, 'updatedAt', updated_at) FROM platform_settings WHERE id = 1);
END $$;--> statement-breakpoint
CREATE FUNCTION console_save_settings(admin uuid, details jsonb, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  UPDATE platform_settings SET billing_whatsapp = details->>'whatsapp', billing_bkash = details->>'bkash', billing_nagad = details->>'nagad',
    billing_bank = details->>'bank', billing_note = details->>'note', updated_at = now() WHERE id = 1;
  PERFORM console_log(admin, 'settings.billing', 'settings', NULL, 'How sellers pay', details, why);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION store_limits, storefront_store_state, store_billing, console_save_custom_plan, console_end_custom_plan, console_settings, console_save_settings FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION store_limits, storefront_store_state, store_billing, console_save_custom_plan, console_end_custom_plan, console_settings, console_save_settings TO uddokta_app;
