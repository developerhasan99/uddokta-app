-- Menus: every member reads and edits them; owners and admins delete, and never main-menu or footer.
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON menus TO uddokta_app;
--> statement-breakpoint
CREATE POLICY menus_read ON menus FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY menus_insert ON menus FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY menus_update ON menus FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY menus_delete ON menus FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin') AND handle NOT IN ('main-menu', 'footer'));
--> statement-breakpoint
-- The two built-in menus come with every store, whichever path makes it.
CREATE FUNCTION store_default_menus() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO menus (store_id, handle, title) VALUES (NEW.id, 'main-menu', 'প্রধান মেনু'), (NEW.id, 'footer', 'ফুটার মেনু');
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION store_default_menus FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER stores_default_menus AFTER INSERT ON stores FOR EACH ROW EXECUTE FUNCTION store_default_menus();
--> statement-breakpoint
-- Existing stores: the old flat header menu becomes the main menu. Known addresses become links by id, so later renames keep working.
INSERT INTO menus (store_id, handle, title, items)
SELECT s.id, 'main-menu', 'প্রধান মেনু', coalesce((
  SELECT jsonb_agg(jsonb_build_object('id', 'm' || x.ord, 'title', x.e->>'label', 'children', '[]'::jsonb, 'link', CASE
      WHEN x.e->>'href' = '/' THEN jsonb_build_object('type', 'home')
      WHEN col.id IS NOT NULL THEN jsonb_build_object('type', 'collection', 'id', col.id)
      WHEN pg.id IS NOT NULL THEN jsonb_build_object('type', 'page', 'id', pg.id)
      ELSE jsonb_build_object('type', 'url', 'url', x.e->>'href') END) ORDER BY x.ord)
  FROM jsonb_array_elements(s.menu) WITH ORDINALITY AS x(e, ord)
  LEFT JOIN LATERAL (SELECT c.id FROM collections c WHERE c.store_id = s.id AND '/collections/' || c.handle = x.e->>'href' LIMIT 1) col ON true
  LEFT JOIN LATERAL (SELECT p.id FROM pages p WHERE p.store_id = s.id AND p.published IS NOT NULL
    AND x.e->>'href' IN ('/' || (p.published_meta->>'handle'), '/pages/' || (p.published_meta->>'handle')) LIMIT 1) pg ON true
), '[]'::jsonb)
FROM stores s;
--> statement-breakpoint
INSERT INTO menus (store_id, handle, title) SELECT id, 'footer', 'ফুটার মেনু' FROM stores;
--> statement-breakpoint
DROP FUNCTION storefront_menu(uuid);
--> statement-breakpoint
-- The storefront has no signed-in user: it reads a store's menus and the addresses of what they link to through these.
CREATE FUNCTION storefront_menus(store uuid) RETURNS TABLE (handle text, items jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.handle, m.items FROM menus m WHERE m.store_id = store
$$;
--> statement-breakpoint
-- Only what a buyer may open: collections with active products, products that are not drafts, published landing pages.
CREATE FUNCTION storefront_link_targets(store uuid, ids uuid[]) RETURNS TABLE (id uuid, type text, handle text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, 'collection', c.handle FROM collections c WHERE c.store_id = store AND c.id = ANY (ids)
    AND EXISTS (SELECT 1 FROM collection_products cp JOIN products p ON p.id = cp.product_id WHERE cp.collection_id = c.id AND p.status = 'active')
  UNION ALL
  SELECT p.id, 'product', p.handle FROM products p WHERE p.store_id = store AND p.id = ANY (ids) AND p.status <> 'draft'
  UNION ALL
  SELECT g.id, 'page', g.published_meta->>'handle' FROM pages g WHERE g.store_id = store AND g.id = ANY (ids) AND g.published IS NOT NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_menus, storefront_link_targets FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_menus, storefront_link_targets TO uddokta_app;
