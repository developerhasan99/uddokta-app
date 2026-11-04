-- Domains already live keep working; their next check asks for the TXT record too.
UPDATE stores SET domain_verified_at = domain_live_at WHERE domain_live_at IS NOT NULL;
--> statement-breakpoint
-- Several stores may claim a domain, so the storefront and the proxy only ever see the verified one.
CREATE OR REPLACE FUNCTION storefront_domain_store(host text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT handle FROM stores WHERE domain = host AND domain_verified_at IS NOT NULL
$$;
--> statement-breakpoint
-- The uddokta.live address redirects only while the seller keeps their domain as the main address.
CREATE OR REPLACE FUNCTION storefront_live_domain(store_handle text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT domain FROM stores WHERE handle = store_handle AND domain_live_at IS NOT NULL AND domain_primary
$$;
--> statement-breakpoint
-- A store proved a domain with its TXT record: other stores whose TXT value is no longer in the domain's DNS lose it,
-- so the real owner can move it. The API passes the TXT values it just read from DNS.
CREATE FUNCTION release_stale_domain(host text, found text[]) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE stores SET domain_verified_at = NULL, domain_live_at = NULL
  WHERE domain = host AND domain_verified_at IS NOT NULL AND NOT ('uddokta=' || id) = ANY (found)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION release_stale_domain FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION release_stale_domain TO uddokta_app;
