ALTER TABLE "stores" ADD COLUMN "deletion_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "deletion_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_deletion_requested_by_users_id_fk" FOREIGN KEY ("deletion_requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ---- Store deletion. The owner asks (store_request_deletion); the store is then offline and read-only for 30 days and
-- the owner can restore it; after that the API's hourly sweep removes it (store_purge_due), or a platform administrator
-- removes it sooner from the console (console_delete_store_now), only while the owner's request stands. Removing a store
-- deletes its row; every tenant table cascades from it. The media keys are returned so the files in R2 go too.

-- Platform columns of stores change only through their definer functions, never from app code (the app role).
CREATE FUNCTION stores_platform_columns() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user = 'uddokta_app' AND (
    (TG_OP = 'INSERT' AND (NEW.suspended_at, NEW.plan_id, NEW.plan_until, NEW.deletion_due_at, NEW.deletion_requested_by) IS DISTINCT FROM (NULL::timestamptz, NULL::uuid, NULL::date, NULL::timestamptz, NULL::uuid))
    OR (TG_OP = 'UPDATE' AND (NEW.suspended_at, NEW.suspend_reason, NEW.plan_id, NEW.plan_until, NEW.deletion_due_at, NEW.deletion_requested_by)
      IS DISTINCT FROM (OLD.suspended_at, OLD.suspend_reason, OLD.plan_id, OLD.plan_until, OLD.deletion_due_at, OLD.deletion_requested_by))) THEN
    RAISE EXCEPTION 'suspension, plan and deletion change only through their functions' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER stores_platform_columns BEFORE INSERT OR UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION stores_platform_columns();--> statement-breakpoint
CREATE FUNCTION store_request_deletion(store uuid) RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  due timestamptz;
BEGIN
  IF my_role(store) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'only an owner can delete the store' USING ERRCODE = '42501'; END IF;
  UPDATE stores SET deletion_due_at = coalesce(deletion_due_at, now() + interval '30 days'), deletion_requested_by = coalesce(deletion_requested_by, current_user_id())
  WHERE id = store RETURNING deletion_due_at INTO due;
  RETURN due;
END $$;--> statement-breakpoint
CREATE FUNCTION store_cancel_deletion(store uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF my_role(store) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'only an owner can restore the store' USING ERRCODE = '42501'; END IF;
  UPDATE stores SET deletion_due_at = NULL, deletion_requested_by = NULL WHERE id = store;
END $$;--> statement-breakpoint
-- Removes one store; returns its media file keys. Not granted to anyone: only the two functions below call it.
CREATE FUNCTION store_purge(store uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  keys jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(k), '[]'::jsonb) INTO keys FROM (SELECT key AS k FROM media WHERE store_id = store UNION ALL SELECT thumb_key FROM media WHERE store_id = store) x;
  DELETE FROM stores WHERE id = store;
  RETURN keys;
END $$;--> statement-breakpoint
-- Stores whose 30 days are over, a few at a time; the audit log keeps a line for each.
CREATE FUNCTION store_purge_due() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s record;
  keys jsonb := '[]'::jsonb;
  gone integer := 0;
BEGIN
  FOR s IN SELECT id, handle FROM stores WHERE deletion_due_at <= now() ORDER BY deletion_due_at LIMIT 10 FOR UPDATE SKIP LOCKED LOOP
    INSERT INTO console_audit (admin_id, admin_email, action, target_type, target_id, target_label, detail, reason)
    VALUES (NULL, 'system', 'store.delete', 'store', s.id, s.handle, '{}'::jsonb, 'The owner asked to delete it and 30 days passed');
    keys := keys || store_purge(s.id);
    gone := gone + 1;
  END LOOP;
  RETURN jsonb_build_object('stores', gone, 'keys', keys);
END $$;--> statement-breakpoint
CREATE FUNCTION console_delete_store_now(admin uuid, store uuid, why text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s stores;
BEGIN
  PERFORM console_check(admin);
  SELECT * INTO s FROM stores WHERE id = store FOR UPDATE;
  IF s.id IS NULL THEN RETURN NULL; END IF;
  IF s.deletion_due_at IS NULL THEN RAISE EXCEPTION 'the owner has not asked to delete this store' USING ERRCODE = '22023'; END IF;
  PERFORM console_log(admin, 'store.delete', 'store', store, s.handle, jsonb_build_object('name', s.name, 'due', s.deletion_due_at), why);
  RETURN store_purge(store);
END $$;--> statement-breakpoint
-- Everything a store holds, table by table (every table with a store_id), without secrets: columns whose names say
-- password, token, secret, credential, api key or hash are left out, as are buyer sessions and login failures.
CREATE FUNCTION console_export_store(admin uuid, store uuid, why text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  tbl record;
  hidden text[];
  rows jsonb;
  tables jsonb := '{}'::jsonb;
  label text;
BEGIN
  PERFORM console_check(admin);
  SELECT handle INTO label FROM stores WHERE id = store;
  IF label IS NULL THEN RETURN NULL; END IF;
  FOR tbl IN SELECT c.table_name::text AS name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'store_id' AND c.table_name NOT IN ('buyer_sessions', 'buyer_login_failures') ORDER BY 1 LOOP
    SELECT coalesce(array_agg(column_name::text), '{}') INTO hidden FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tbl.name AND column_name ~ '(password|token|secret|credential|api_key|hash)';
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) FROM %I x WHERE x.store_id = $1', tbl.name) INTO rows USING store, hidden;
    tables := tables || jsonb_build_object(tbl.name, rows);
  END LOOP;
  PERFORM console_log(admin, 'store.export', 'store', store, label, '{}'::jsonb, why);
  RETURN jsonb_build_object('format', 'uddokta-store-export', 'exportedAt', now(),
    'store', (SELECT to_jsonb(s) - ARRAY['store_password_hash'] FROM stores s WHERE s.id = store),
    'members', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', u.name, 'email', u.email, 'role', m.role, 'since', m.created_at) ORDER BY m.created_at), '[]'::jsonb)
      FROM store_members m JOIN users u ON u.id = m.user_id WHERE m.store_id = store),
    'tables', tables);
END $$;--> statement-breakpoint
-- The console's store list and page show a pending deletion.
DROP FUNCTION console_stores(uuid, text, integer, integer);--> statement-breakpoint
CREATE FUNCTION console_stores(admin uuid, search text, lim integer, off integer)
RETURNS TABLE (id uuid, name text, handle text, owner_email text, plan_name text, plan_until date, suspended_at timestamptz, deletion_due_at timestamptz, created_at timestamptz, products integer, orders integer, storage_bytes bigint, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN QUERY SELECT s.id, s.name, s.handle,
    (SELECT u.email FROM store_members m JOIN users u ON u.id = m.user_id WHERE m.store_id = s.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1),
    l.plan_name, l.plan_until, s.suspended_at, s.deletion_due_at, s.created_at,
    (SELECT count(*)::integer FROM products p WHERE p.store_id = s.id), (SELECT count(*)::integer FROM orders o WHERE o.store_id = s.id),
    (SELECT coalesce(sum(m.size_bytes), 0)::bigint FROM media m WHERE m.store_id = s.id), count(*) OVER ()
  FROM stores s, store_limits(s.id) l
  WHERE search = '' OR s.name ILIKE '%' || search || '%' OR s.handle ILIKE '%' || search || '%' OR coalesce(s.domain, '') ILIKE '%' || search || '%'
  ORDER BY s.created_at DESC LIMIT least(lim, 100) OFFSET off;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION console_store(admin uuid, store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'domain', CASE WHEN s.domain_live_at IS NOT NULL THEN s.domain END,
    'createdAt', s.created_at, 'suspendedAt', s.suspended_at, 'suspendReason', coalesce(s.suspend_reason, ''),
    'deletionDueAt', s.deletion_due_at, 'deletionRequestedBy', (SELECT u.email FROM users u WHERE u.id = s.deletion_requested_by),
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
-- A store waiting to be deleted is closed to buyers, like a suspended one.
CREATE OR REPLACE FUNCTION storefront_store_state(store_handle text) RETURNS TABLE (suspended boolean, online_store boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.suspended_at IS NOT NULL OR s.deletion_due_at IS NOT NULL, 'onlineStore' = ANY (l.features) FROM stores s, store_limits(s.id) l WHERE s.handle = store_handle
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION stores_platform_columns, store_request_deletion, store_cancel_deletion, store_purge, store_purge_due, console_delete_store_now, console_export_store, console_stores FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION store_request_deletion, store_cancel_deletion, store_purge_due, console_delete_store_now, console_export_store, console_stores TO uddokta_app;
