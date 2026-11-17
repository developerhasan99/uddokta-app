CREATE TABLE "console_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"admin_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"target_label" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_bdt" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"max_landing_pages" integer,
	"storage_mb" integer NOT NULL,
	"max_members" integer,
	"max_products" integer,
	"custom_domain" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_name_unique" UNIQUE("name"),
	CONSTRAINT "plans_limits" CHECK ("plans"."price_bdt" >= 0 and "plans"."storage_mb" > 0 and coalesce("plans"."max_landing_pages", 0) >= 0 and coalesce("plans"."max_members", 1) >= 1 and coalesce("plans"."max_products", 0) >= 0),
	CONSTRAINT "plans_default_live" CHECK (not ("plans"."is_default" and "plans"."archived"))
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"plan_id" uuid,
	"amount" integer NOT NULL,
	"months" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_payments_values" CHECK ("store_payments"."amount" >= 0 and "store_payments"."months" between 1 and 36)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "plan_until" date;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "suspend_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "console_audit" ADD CONSTRAINT "console_audit_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_payments" ADD CONSTRAINT "store_payments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_payments" ADD CONSTRAINT "store_payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_payments" ADD CONSTRAINT "store_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "console_audit_time" ON "console_audit" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_one_default" ON "plans" USING btree ("is_default") WHERE "plans"."is_default";--> statement-breakpoint
CREATE INDEX "store_payments_store" ON "store_payments" USING btree ("store_id","created_at");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ---- Platform console. None of these tables is granted to the app role: only the functions below reach them, and
-- every console function checks its caller is a platform administrator and writes the audit row itself.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE store_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE console_audit ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON platform_admins, plans, store_payments, console_audit FROM PUBLIC;--> statement-breakpoint
-- The starting plan keeps today's limits, so nothing changes for existing stores.
INSERT INTO plans (name, price_bdt, is_default, max_landing_pages, storage_mb, max_members, max_products, custom_domain)
VALUES ('Free', 0, true, 50, 1024, NULL, NULL, true);--> statement-breakpoint
-- Suspended accounts have no live session; suspended stores stay readable by their team but refuse changes (API).
CREATE OR REPLACE FUNCTION session_owner(hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = hash AND s.expires_at > now() AND u.suspended_at IS NULL
$$;--> statement-breakpoint
CREATE FUNCTION account_suspended(account uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT suspended_at IS NOT NULL FROM users WHERE id = account
$$;--> statement-breakpoint
-- The plan a store is on now: its own while paid (or with no end date), else the default plan.
CREATE FUNCTION store_limits(store uuid) RETURNS TABLE (plan_name text, plan_until date, max_landing_pages integer, storage_mb integer, max_members integer, max_products integer, custom_domain boolean, suspended boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.name, CASE WHEN p.id = s.plan_id THEN s.plan_until END, p.max_landing_pages, p.storage_mb, p.max_members, p.max_products, p.custom_domain, s.suspended_at IS NOT NULL
  FROM stores s JOIN plans p ON p.id = CASE WHEN s.plan_id IS NOT NULL AND (s.plan_until IS NULL OR s.plan_until >= current_date) THEN s.plan_id ELSE (SELECT id FROM plans WHERE is_default) END
  WHERE s.id = store
$$;--> statement-breakpoint
CREATE FUNCTION storefront_store_suspended(store_handle text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT suspended_at IS NOT NULL FROM stores WHERE handle = store_handle), false)
$$;--> statement-breakpoint
-- The user behind a console request: a live session signed in within 12 hours, of an active platform administrator.
CREATE FUNCTION console_session(hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id JOIN platform_admins a ON a.user_id = s.user_id
  WHERE s.token_hash = hash AND s.expires_at > now() AND s.created_at > now() - interval '12 hours' AND u.suspended_at IS NULL
$$;--> statement-breakpoint
CREATE FUNCTION console_check(admin uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  address text;
BEGIN
  SELECT u.email INTO address FROM platform_admins a JOIN users u ON u.id = a.user_id WHERE a.user_id = admin AND u.suspended_at IS NULL;
  IF address IS NULL THEN RAISE EXCEPTION 'not a platform administrator' USING ERRCODE = '42501'; END IF;
  RETURN address;
END $$;--> statement-breakpoint
CREATE FUNCTION console_log(admin uuid, what text, kind text, target uuid, label text, details jsonb, why text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO console_audit (admin_id, admin_email, action, target_type, target_id, target_label, detail, reason)
  VALUES (admin, console_check(admin), what, kind, target, coalesce(label, ''), coalesce(details, '{}'), coalesce(btrim(why), ''))
$$;--> statement-breakpoint
CREATE FUNCTION console_overview(admin uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN jsonb_build_object(
    'users', (SELECT count(*) FROM users),
    'usersSuspended', (SELECT count(*) FROM users WHERE suspended_at IS NOT NULL),
    'usersNew30', (SELECT count(*) FROM users WHERE created_at > now() - interval '30 days'),
    'stores', (SELECT count(*) FROM stores),
    'storesSuspended', (SELECT count(*) FROM stores WHERE suspended_at IS NOT NULL),
    'storesNew30', (SELECT count(*) FROM stores WHERE created_at > now() - interval '30 days'),
    'orders', (SELECT count(*) FROM orders),
    'orders30', (SELECT count(*) FROM orders WHERE created_at > now() - interval '30 days'),
    'storageBytes', (SELECT coalesce(sum(size_bytes), 0) FROM media),
    'payments30', (SELECT coalesce(sum(amount), 0) FROM store_payments WHERE created_at > now() - interval '30 days'),
    'signups', (SELECT jsonb_agg(jsonb_build_object('day', d::date, 'users', (SELECT count(*) FROM users WHERE created_at::date = d::date), 'stores', (SELECT count(*) FROM stores WHERE created_at::date = d::date)) ORDER BY d)
      FROM generate_series(current_date - 29, current_date, interval '1 day') d),
    'plans', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', l.plan_name, 'stores', l.n) ORDER BY l.n DESC), '[]') FROM (SELECT x.plan_name, count(*) AS n FROM stores s, store_limits(s.id) x GROUP BY x.plan_name) l)
  );
END $$;--> statement-breakpoint
CREATE FUNCTION console_users(admin uuid, search text, lim integer, off integer)
RETURNS TABLE (id uuid, name text, email text, verified boolean, suspended_at timestamptz, created_at timestamptz, stores integer, is_admin boolean, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN QUERY SELECT u.id, u.name, u.email, u.email_verified_at IS NOT NULL, u.suspended_at, u.created_at,
    (SELECT count(*)::integer FROM store_members m WHERE m.user_id = u.id), EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id = u.id), count(*) OVER ()
  FROM users u
  WHERE search = '' OR u.email ILIKE '%' || search || '%' OR u.name ILIKE '%' || search || '%'
  ORDER BY u.created_at DESC LIMIT least(lim, 100) OFFSET off;
END $$;--> statement-breakpoint
CREATE FUNCTION console_user(admin uuid, account uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'language', u.language, 'verified', u.email_verified_at IS NOT NULL,
    'suspendedAt', u.suspended_at, 'createdAt', u.created_at, 'isAdmin', EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id = u.id),
    'sessions', (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()),
    'stores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'role', m.role) ORDER BY s.name), '[]') FROM store_members m JOIN stores s ON s.id = m.store_id WHERE m.user_id = u.id))
  FROM users u WHERE u.id = account);
END $$;--> statement-breakpoint
CREATE FUNCTION console_stores(admin uuid, search text, lim integer, off integer)
RETURNS TABLE (id uuid, name text, handle text, owner_email text, plan_name text, plan_until date, suspended_at timestamptz, created_at timestamptz, products integer, orders integer, storage_bytes bigint, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN QUERY SELECT s.id, s.name, s.handle,
    (SELECT u.email FROM store_members m JOIN users u ON u.id = m.user_id WHERE m.store_id = s.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1),
    l.plan_name, l.plan_until, s.suspended_at, s.created_at,
    (SELECT count(*)::integer FROM products p WHERE p.store_id = s.id), (SELECT count(*)::integer FROM orders o WHERE o.store_id = s.id),
    (SELECT coalesce(sum(m.size_bytes), 0)::bigint FROM media m WHERE m.store_id = s.id), count(*) OVER ()
  FROM stores s, store_limits(s.id) l
  WHERE search = '' OR s.name ILIKE '%' || search || '%' OR s.handle ILIKE '%' || search || '%' OR coalesce(s.domain, '') ILIKE '%' || search || '%'
  ORDER BY s.created_at DESC LIMIT least(lim, 100) OFFSET off;
END $$;--> statement-breakpoint
CREATE FUNCTION console_store(admin uuid, store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'domain', CASE WHEN s.domain_live_at IS NOT NULL THEN s.domain END,
    'createdAt', s.created_at, 'suspendedAt', s.suspended_at, 'suspendReason', coalesce(s.suspend_reason, ''),
    'planId', s.plan_id, 'planUntil', s.plan_until, 'limits', (SELECT to_jsonb(l) FROM store_limits(s.id) l),
    'counts', jsonb_build_object('products', (SELECT count(*) FROM products p WHERE p.store_id = s.id), 'orders', (SELECT count(*) FROM orders o WHERE o.store_id = s.id),
      'orders30', (SELECT count(*) FROM orders o WHERE o.store_id = s.id AND o.created_at > now() - interval '30 days'),
      'landingPages', (SELECT count(*) FROM pages p WHERE p.store_id = s.id), 'storageBytes', (SELECT coalesce(sum(m.size_bytes), 0) FROM media m WHERE m.store_id = s.id)),
    'members', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', m.role) ORDER BY m.created_at), '[]') FROM store_members m JOIN users u ON u.id = m.user_id WHERE m.store_id = s.id),
    'payments', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'months', p.months, 'method', p.method, 'reference', p.reference, 'plan', pl.name, 'by', u.email, 'at', p.created_at) ORDER BY p.created_at DESC), '[]')
      FROM store_payments p LEFT JOIN plans pl ON pl.id = p.plan_id LEFT JOIN users u ON u.id = p.recorded_by WHERE p.store_id = s.id))
  FROM stores s WHERE s.id = store);
END $$;--> statement-breakpoint
CREATE FUNCTION console_suspend_user(admin uuid, account uuid, suspend boolean, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target users;
BEGIN
  PERFORM console_check(admin);
  IF account = admin THEN RAISE EXCEPTION 'cannot suspend yourself' USING ERRCODE = 'UD101'; END IF;
  UPDATE users SET suspended_at = CASE WHEN suspend THEN coalesce(suspended_at, now()) END WHERE id = account RETURNING * INTO target;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such user' USING ERRCODE = 'UD100'; END IF;
  IF suspend THEN DELETE FROM sessions WHERE user_id = account; DELETE FROM account_tokens WHERE user_id = account; END IF;
  PERFORM console_log(admin, CASE WHEN suspend THEN 'user.suspend' ELSE 'user.restore' END, 'user', account, target.email, '{}', why);
END $$;--> statement-breakpoint
CREATE FUNCTION console_sign_out_user(admin uuid, account uuid, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  DELETE FROM sessions WHERE user_id = account;
  PERFORM console_log(admin, 'user.signOut', 'user', account, (SELECT email FROM users WHERE id = account), '{}', why);
END $$;--> statement-breakpoint
CREATE FUNCTION console_suspend_store(admin uuid, store uuid, suspend boolean, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
BEGIN
  PERFORM console_check(admin);
  UPDATE stores SET suspended_at = CASE WHEN suspend THEN coalesce(suspended_at, now()) END, suspend_reason = CASE WHEN suspend THEN btrim(why) END WHERE id = store RETURNING * INTO target;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such store' USING ERRCODE = 'UD100'; END IF;
  PERFORM console_log(admin, CASE WHEN suspend THEN 'store.suspend' ELSE 'store.restore' END, 'store', store, target.name || ' (' || target.handle || ')', '{}', why);
END $$;--> statement-breakpoint
-- Sets a store's plan and its end date (null: no end). Null plan puts it back on the default.
CREATE FUNCTION console_set_plan(admin uuid, store uuid, plan uuid, until date, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
BEGIN
  PERFORM console_check(admin);
  IF plan IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plans WHERE id = plan AND NOT archived) THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  UPDATE stores SET plan_id = plan, plan_until = CASE WHEN plan IS NULL THEN NULL ELSE until END WHERE id = store RETURNING * INTO target;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such store' USING ERRCODE = 'UD100'; END IF;
  PERFORM console_log(admin, 'store.plan', 'store', store, target.name || ' (' || target.handle || ')',
    jsonb_build_object('plan', (SELECT name FROM plans WHERE id = plan), 'until', until), why);
END $$;--> statement-breakpoint
-- Records a payment taken outside the app and extends the plan by its months, from today or from the current end date.
CREATE FUNCTION console_record_payment(admin uuid, store uuid, plan uuid, paid integer, paid_months integer, paid_by text, ref text, why text) RETURNS date
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
  ends date;
BEGIN
  PERFORM console_check(admin);
  IF NOT EXISTS (SELECT 1 FROM plans WHERE id = plan AND NOT archived) THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  SELECT * INTO target FROM stores WHERE id = store FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such store' USING ERRCODE = 'UD100'; END IF;
  ends := (CASE WHEN target.plan_id = plan AND target.plan_until >= current_date THEN target.plan_until ELSE current_date END + make_interval(months => paid_months))::date;
  INSERT INTO store_payments (store_id, plan_id, amount, months, method, reference, recorded_by) VALUES (store, plan, paid, paid_months, paid_by, coalesce(btrim(ref), ''), admin);
  UPDATE stores SET plan_id = plan, plan_until = ends WHERE id = store;
  PERFORM console_log(admin, 'store.payment', 'store', store, target.name || ' (' || target.handle || ')',
    jsonb_build_object('plan', (SELECT name FROM plans WHERE id = plan), 'amount', paid, 'months', paid_months, 'method', paid_by, 'reference', ref, 'until', ends), why);
  RETURN ends;
END $$;--> statement-breakpoint
CREATE FUNCTION console_plans(admin uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'priceBdt', p.price_bdt, 'isDefault', p.is_default, 'maxLandingPages', p.max_landing_pages,
    'storageMb', p.storage_mb, 'maxMembers', p.max_members, 'maxProducts', p.max_products, 'customDomain', p.custom_domain, 'archived', p.archived,
    'stores', (SELECT count(*) FROM stores s WHERE s.plan_id = p.id)) ORDER BY p.archived, p.price_bdt, p.name), '[]') FROM plans p);
END $$;--> statement-breakpoint
-- Creates (null id) or changes a plan. Making one the default takes it from the old one; the default cannot be archived.
CREATE FUNCTION console_save_plan(admin uuid, plan uuid, details jsonb, why text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  saved uuid;
BEGIN
  PERFORM console_check(admin);
  IF (details->>'isDefault')::boolean THEN UPDATE plans SET is_default = false WHERE is_default AND id IS DISTINCT FROM plan; END IF;
  IF plan IS NULL THEN
    INSERT INTO plans (name, price_bdt, is_default, max_landing_pages, storage_mb, max_members, max_products, custom_domain, archived)
    VALUES (details->>'name', (details->>'priceBdt')::integer, (details->>'isDefault')::boolean, (details->>'maxLandingPages')::integer, (details->>'storageMb')::integer,
      (details->>'maxMembers')::integer, (details->>'maxProducts')::integer, (details->>'customDomain')::boolean, (details->>'archived')::boolean)
    RETURNING id INTO saved;
  ELSE
    UPDATE plans SET name = details->>'name', price_bdt = (details->>'priceBdt')::integer, is_default = (details->>'isDefault')::boolean,
      max_landing_pages = (details->>'maxLandingPages')::integer, storage_mb = (details->>'storageMb')::integer, max_members = (details->>'maxMembers')::integer,
      max_products = (details->>'maxProducts')::integer, custom_domain = (details->>'customDomain')::boolean, archived = (details->>'archived')::boolean
    WHERE id = plan RETURNING id INTO saved;
    IF saved IS NULL THEN RAISE EXCEPTION 'no such plan' USING ERRCODE = 'UD100'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plans WHERE is_default) THEN RAISE EXCEPTION 'one plan must be the default' USING ERRCODE = 'UD102'; END IF;
  PERFORM console_log(admin, CASE WHEN plan IS NULL THEN 'plan.create' ELSE 'plan.update' END, 'plan', saved, details->>'name', details, why);
  RETURN saved;
END $$;--> statement-breakpoint
CREATE FUNCTION console_audit_log(admin uuid, lim integer, off integer)
RETURNS TABLE (id uuid, admin_email text, action text, target_type text, target_id uuid, target_label text, detail jsonb, reason text, created_at timestamptz, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN QUERY SELECT a.id, a.admin_email, a.action, a.target_type, a.target_id, a.target_label, a.detail, a.reason, a.created_at, count(*) OVER ()
  FROM console_audit a ORDER BY a.created_at DESC LIMIT least(lim, 100) OFFSET off;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION account_suspended, store_limits, storefront_store_suspended, console_session, console_check, console_log, console_overview, console_users, console_user,
  console_stores, console_store, console_suspend_user, console_sign_out_user, console_suspend_store, console_set_plan, console_record_payment, console_plans, console_save_plan, console_audit_log FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION account_suspended, store_limits, storefront_store_suspended, console_session, console_check, console_log, console_overview, console_users, console_user,
  console_stores, console_store, console_suspend_user, console_sign_out_user, console_suspend_store, console_set_plan, console_record_payment, console_plans, console_save_plan, console_audit_log TO uddokta_app;
