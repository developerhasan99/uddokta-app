ALTER TABLE "plans" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Hidden plans are left off sellers' Billing page; stores already on one still see it as their plan.
CREATE OR REPLACE FUNCTION store_billing(store uuid) RETURNS jsonb
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
      FROM plans p WHERE p.store_id IS NULL AND NOT p.archived AND NOT p.hidden),
    'pay', (SELECT jsonb_build_object('whatsapp', billing_whatsapp, 'bkash', billing_bkash, 'nagad', billing_nagad, 'bank', billing_bank, 'note', billing_note) FROM platform_settings WHERE id = 1))
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION console_plans(admin uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'priceBdt', p.price_bdt, 'isDefault', p.is_default, 'maxLandingPages', p.max_landing_pages,
    'storageMb', p.storage_mb, 'maxMembers', p.max_members, 'maxProducts', p.max_products, 'features', p.features, 'billingNote', p.billing_note, 'archived', p.archived,
    'hidden', p.hidden, 'payments', (SELECT count(*) FROM store_payments sp WHERE sp.plan_id = p.id),
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
    INSERT INTO plans (name, price_bdt, is_default, max_landing_pages, storage_mb, max_members, max_products, features, billing_note, archived, hidden)
    VALUES (details->>'name', (details->>'priceBdt')::integer, (details->>'isDefault')::boolean, (details->>'maxLandingPages')::integer, (details->>'storageMb')::integer,
      (details->>'maxMembers')::integer, (details->>'maxProducts')::integer, tools, coalesce(details->>'billingNote', ''), (details->>'archived')::boolean, coalesce((details->>'hidden')::boolean, false))
    RETURNING id INTO saved;
  ELSE
    UPDATE plans SET name = details->>'name', price_bdt = (details->>'priceBdt')::integer, is_default = (details->>'isDefault')::boolean,
      max_landing_pages = (details->>'maxLandingPages')::integer, storage_mb = (details->>'storageMb')::integer, max_members = (details->>'maxMembers')::integer,
      max_products = (details->>'maxProducts')::integer, features = tools, billing_note = coalesce(details->>'billingNote', ''), archived = (details->>'archived')::boolean,
      hidden = coalesce((details->>'hidden')::boolean, false)
    WHERE id = plan RETURNING id INTO saved;
    IF saved IS NULL THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plans WHERE is_default) THEN RAISE EXCEPTION 'one plan must be the default' USING ERRCODE = 'UD102'; END IF;
  PERFORM console_log(admin, CASE WHEN plan IS NULL THEN 'plan.create' ELSE 'plan.update' END, 'plan', saved, details->>'name', details, why);
  RETURN saved;
END $$;--> statement-breakpoint
-- Moves every store set to one public plan onto another (null: the default plan, with no end date). Stores keep their
-- end date on another plan. Returns how many moved. Used before archiving or deleting a plan.
CREATE FUNCTION console_move_plan_stores(admin uuid, source uuid, target uuid, why text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  moved integer;
BEGIN
  PERFORM console_check(admin);
  IF NOT EXISTS (SELECT 1 FROM plans WHERE id = source AND store_id IS NULL) THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  IF target IS NOT NULL AND (target = source OR NOT EXISTS (SELECT 1 FROM plans WHERE id = target AND store_id IS NULL AND NOT archived)) THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  UPDATE stores SET plan_id = target, plan_until = CASE WHEN target IS NULL THEN NULL ELSE plan_until END WHERE plan_id = source;
  GET DIAGNOSTICS moved = ROW_COUNT;
  PERFORM console_log(admin, 'plan.moveStores', 'plan', source, (SELECT name FROM plans WHERE id = source),
    jsonb_build_object('to', coalesce((SELECT name FROM plans WHERE id = target), 'default plan'), 'stores', moved), why);
  RETURN moved;
END $$;--> statement-breakpoint
-- Deletes a public plan nobody uses: not the default, no store set to it, no payment recorded against it (those keep
-- the plan's name, so such a plan can only be archived).
CREATE FUNCTION console_delete_plan(admin uuid, plan uuid, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target plans;
BEGIN
  PERFORM console_check(admin);
  SELECT * INTO target FROM plans WHERE id = plan AND store_id IS NULL FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  IF target.is_default THEN RAISE EXCEPTION 'one plan must be the default' USING ERRCODE = 'UD102'; END IF;
  IF EXISTS (SELECT 1 FROM stores WHERE plan_id = plan) THEN RAISE EXCEPTION 'stores are on this plan' USING ERRCODE = 'UD103'; END IF;
  IF EXISTS (SELECT 1 FROM store_payments WHERE plan_id = plan) THEN RAISE EXCEPTION 'payments were recorded on this plan' USING ERRCODE = 'UD104'; END IF;
  DELETE FROM plans WHERE id = plan;
  PERFORM console_log(admin, 'plan.delete', 'plan', plan, target.name, '{}', why);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION console_move_plan_stores, console_delete_plan FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION console_move_plan_stores, console_delete_plan TO uddokta_app;
