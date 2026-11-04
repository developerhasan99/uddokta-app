ALTER TABLE stores ADD CONSTRAINT stores_menu CHECK (jsonb_typeof(menu) = 'array' AND jsonb_array_length(menu) <= 12);
--> statement-breakpoint
CREATE FUNCTION storefront_menu(store uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT menu FROM stores WHERE id = store
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_menu FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_menu TO uddokta_app;
