-- The store a seller's own domain belongs to. Used by the storefront, and by the domains proxy before it asks for a certificate.
CREATE FUNCTION storefront_domain_store(host text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT handle FROM stores WHERE domain = host
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_domain_store FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_domain_store TO uddokta_app;
--> statement-breakpoint
-- A store's own domain once it is live, so its uddokta.live address can redirect there.
CREATE FUNCTION storefront_live_domain(store_handle text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT domain FROM stores WHERE handle = store_handle AND domain_live_at IS NOT NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_live_domain FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_live_domain TO uddokta_app;
