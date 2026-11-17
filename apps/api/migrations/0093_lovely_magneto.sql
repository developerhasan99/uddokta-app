CREATE TABLE "buyer_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_accounts_store_phone" UNIQUE("store_id","phone"),
	CONSTRAINT "buyer_accounts_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "buyer_accounts_phone" CHECK ("buyer_accounts"."phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "buyer_accounts_text" CHECK (char_length(btrim("buyer_accounts"."name")) between 1 and 100 and char_length("buyer_accounts"."address") <= 500)
);
--> statement-breakpoint
CREATE TABLE "buyer_login_failures" (
	"store_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "templates" DROP CONSTRAINT "templates_type";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_account_id" uuid;--> statement-breakpoint
ALTER TABLE "buyer_accounts" ADD CONSTRAINT "buyer_accounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_login_failures" ADD CONSTRAINT "buyer_login_failures_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_sessions" ADD CONSTRAINT "buyer_sessions_account" FOREIGN KEY ("store_id","account_id") REFERENCES "public"."buyer_accounts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyer_login_failures_phone" ON "buyer_login_failures" USING btree ("store_id","phone","at");--> statement-breakpoint
CREATE INDEX "orders_store_buyer" ON "orders" USING btree ("store_id","buyer_account_id");--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_type" CHECK ("templates"."type" in ('header', 'footer', 'home', 'product', 'collection', 'products', 'collections', 'page', 'cart', 'search', 'account', 'notFound'));--> statement-breakpoint
-- Buyer accounts. The app role gets no direct access to these tables (row-level security on, no policies, no grants):
-- the storefront reaches them only through the functions below, which take the store id from the server.
ALTER TABLE orders ADD CONSTRAINT orders_buyer_account FOREIGN KEY (store_id, buyer_account_id) REFERENCES buyer_accounts (store_id, id) ON DELETE SET NULL (buyer_account_id);--> statement-breakpoint
ALTER TABLE buyer_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE buyer_sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE buyer_login_failures ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON buyer_accounts, buyer_sessions, buyer_login_failures FROM PUBLIC;--> statement-breakpoint
CREATE FUNCTION storefront_buyer_register(store uuid, buyer_phone text, buyer_name text, hash text) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO buyer_accounts (store_id, phone, name, password_hash) VALUES (store, buyer_phone, btrim(buyer_name), hash) RETURNING id
$$;--> statement-breakpoint
CREATE FUNCTION storefront_buyer_password(store uuid, buyer_phone text) RETURNS TABLE (id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.password_hash FROM buyer_accounts a WHERE a.store_id = store AND a.phone = buyer_phone
$$;--> statement-breakpoint
-- Wrong passwords in the last 15 minutes for one number on one store; recording one also sweeps old rows.
CREATE FUNCTION storefront_buyer_failures(store uuid, buyer_phone text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer FROM buyer_login_failures f WHERE f.store_id = store AND f.phone = buyer_phone AND f.at > now() - interval '15 minutes'
$$;--> statement-breakpoint
CREATE FUNCTION storefront_buyer_failed(store uuid, buyer_phone text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM buyer_login_failures WHERE at < now() - interval '1 day';
  INSERT INTO buyer_login_failures (store_id, phone) VALUES (store, buyer_phone);
$$;--> statement-breakpoint
CREATE FUNCTION storefront_buyer_session_start(store uuid, account uuid, token text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM buyer_login_failures f USING buyer_accounts a WHERE a.id = account AND a.store_id = store AND f.store_id = store AND f.phone = a.phone;
  DELETE FROM buyer_sessions WHERE expires_at < now();
  INSERT INTO buyer_sessions (token_hash, store_id, account_id, expires_at) VALUES (token, store, account, now() + interval '30 days');
$$;--> statement-breakpoint
CREATE FUNCTION storefront_buyer_session(store uuid, token text) RETURNS TABLE (id uuid, phone text, name text, address text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.phone, a.name, a.address FROM buyer_sessions s JOIN buyer_accounts a ON a.store_id = s.store_id AND a.id = s.account_id
  WHERE s.token_hash = token AND s.store_id = store AND s.expires_at > now()
$$;--> statement-breakpoint
CREATE FUNCTION storefront_buyer_session_end(store uuid, token text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM buyer_sessions WHERE token_hash = token AND store_id = store
$$;--> statement-breakpoint
CREATE FUNCTION storefront_buyer_update(store uuid, account uuid, buyer_name text, buyer_address text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE buyer_accounts SET name = btrim(buyer_name), address = btrim(buyer_address) WHERE store_id = store AND id = account
$$;--> statement-breakpoint
-- The orders an account placed while signed in, newest first, with a one-line summary of what was bought.
CREATE FUNCTION storefront_buyer_orders(store uuid, account uuid) RETURNS TABLE (number integer, status text, total integer, created_at timestamptz, items text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.number, o.status, o.total, o.created_at,
    (SELECT string_agg(i.product_name || CASE WHEN i.quantity > 1 THEN ' × ' || i.quantity ELSE '' END, ', ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id)
  FROM orders o WHERE o.store_id = store AND o.buyer_account_id = account ORDER BY o.created_at DESC LIMIT 50
$$;--> statement-breakpoint
-- Marks the order a checkout token placed as this account's (once; a receipt of another store never matches).
CREATE FUNCTION storefront_link_order(store uuid, receipt uuid, account uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE orders o SET buyer_account_id = account FROM checkout_receipts r
  WHERE r.store_id = store AND r.token = receipt AND o.store_id = store AND o.number = r.number AND o.buyer_account_id IS NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_buyer_register, storefront_buyer_password, storefront_buyer_failures, storefront_buyer_failed, storefront_buyer_session_start, storefront_buyer_session, storefront_buyer_session_end, storefront_buyer_update, storefront_buyer_orders, storefront_link_order FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_buyer_register, storefront_buyer_password, storefront_buyer_failures, storefront_buyer_failed, storefront_buyer_session_start, storefront_buyer_session, storefront_buyer_session_end, storefront_buyer_update, storefront_buyer_orders, storefront_link_order TO uddokta_app;
