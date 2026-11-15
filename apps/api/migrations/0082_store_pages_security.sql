-- Store pages: every member reads, adds and edits; owners and admins delete.
ALTER TABLE store_pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON store_pages TO uddokta_app;
--> statement-breakpoint
CREATE POLICY store_pages_read ON store_pages FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY store_pages_insert ON store_pages FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY store_pages_update ON store_pages FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY store_pages_delete ON store_pages FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
-- Landing pages and store pages share /:handle, so a handle (a landing page's draft or live one) belongs to one page.
-- The API picks free handles; this catches two saves racing. Runs as definer so it sees both tables whatever the caller's role.
CREATE FUNCTION page_handle_free(store uuid, h text, landing uuid, store_page uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM pages p WHERE p.store_id = store AND p.id IS DISTINCT FROM landing
      AND (p.handle = h OR (p.published IS NOT NULL AND p.published_meta->>'handle' = h)))
    AND NOT EXISTS (SELECT 1 FROM store_pages s WHERE s.store_id = store AND s.id IS DISTINCT FROM store_page AND s.handle = h)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION page_handle_free FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION page_handle_free TO uddokta_app;
--> statement-breakpoint
CREATE FUNCTION check_page_handle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('page-handles:' || NEW.store_id));
  IF TG_TABLE_NAME = 'store_pages' THEN
    IF NOT page_handle_free(NEW.store_id, NEW.handle, NULL, NEW.id) THEN
      RAISE EXCEPTION 'page handle taken' USING ERRCODE = 'unique_violation', CONSTRAINT = 'page_handles';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM store_pages s WHERE s.store_id = NEW.store_id
      AND (s.handle = NEW.handle OR (NEW.published IS NOT NULL AND s.handle = NEW.published_meta->>'handle'))) THEN
    RAISE EXCEPTION 'page handle taken' USING ERRCODE = 'unique_violation', CONSTRAINT = 'page_handles';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION check_page_handle FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER store_pages_handle BEFORE INSERT OR UPDATE OF handle ON store_pages FOR EACH ROW EXECUTE FUNCTION check_page_handle();
--> statement-breakpoint
CREATE TRIGGER pages_handle BEFORE INSERT OR UPDATE OF handle, published_meta, published ON pages FOR EACH ROW EXECUTE FUNCTION check_page_handle();
--> statement-breakpoint
-- A store page a buyer may open: visible, and its publish time (if any) has come. Contact details are for the contact page.
CREATE FUNCTION storefront_store_page(store uuid, page_handle text)
RETURNS TABLE (id uuid, title text, body text, policy text, template text, seo_title text, seo_description text,
  phone text, whatsapp text, email text, address text, facebook text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.title, p.body, p.policy, p.template, p.seo_title, p.seo_description, s.phone, s.whatsapp, s.email, s.address, s.facebook
  FROM store_pages p JOIN stores s ON s.id = p.store_id
  WHERE p.store_id = store AND p.handle = page_handle AND p.visible AND (p.publish_at IS NULL OR p.publish_at <= now())
$$;
--> statement-breakpoint
-- /policies/:kind finds the page for a policy.
CREATE FUNCTION storefront_policy(store uuid, kind text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.handle FROM store_pages p WHERE p.store_id = store AND p.policy = kind AND p.visible AND (p.publish_at IS NULL OR p.publish_at <= now())
$$;
--> statement-breakpoint
-- Menus may link to store pages too.
CREATE OR REPLACE FUNCTION storefront_link_targets(store uuid, ids uuid[]) RETURNS TABLE (id uuid, type text, handle text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, 'collection', c.handle FROM collections c WHERE c.store_id = store AND c.id = ANY (ids)
    AND EXISTS (SELECT 1 FROM collection_products cp JOIN products p ON p.id = cp.product_id WHERE cp.collection_id = c.id AND p.status = 'active')
  UNION ALL
  SELECT p.id, 'product', p.handle FROM products p WHERE p.store_id = store AND p.id = ANY (ids) AND p.status <> 'draft'
  UNION ALL
  SELECT g.id, 'page', g.published_meta->>'handle' FROM pages g WHERE g.store_id = store AND g.id = ANY (ids) AND g.published IS NOT NULL
  UNION ALL
  SELECT s.id, 'storePage', s.handle FROM store_pages s WHERE s.store_id = store AND s.id = ANY (ids) AND s.visible AND (s.publish_at IS NULL OR s.publish_at <= now())
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_store_page, storefront_policy FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_store_page, storefront_policy TO uddokta_app;
