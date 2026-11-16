CREATE TABLE "template_media" (
	"store_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "template_media_template_id_media_id_pk" PRIMARY KEY("template_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "templates_title" CHECK (char_length(btrim("templates"."title")) between 1 and 100),
	CONSTRAINT "templates_type" CHECK ("templates"."type" in ('header', 'footer', 'home', 'product', 'collection', 'products', 'collections', 'page', 'cart', 'search', 'notFound')),
	CONSTRAINT "templates_default_published" CHECK (not "templates"."is_default" or "templates"."published" is not null)
);
--> statement-breakpoint
ALTER TABLE "versions" DROP CONSTRAINT "versions_owner";--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "store_pages" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "template_media" ADD CONSTRAINT "template_media_template" FOREIGN KEY ("store_id","template_id") REFERENCES "public"."templates"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_media_media" ON "template_media" USING btree ("store_id","media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_store_default" ON "templates" USING btree ("store_id","type") WHERE "templates"."is_default";--> statement-breakpoint
CREATE INDEX "templates_store_updated" ON "templates" USING btree ("store_id","updated_at");--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_template" FOREIGN KEY ("store_id","template_id") REFERENCES "public"."templates"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "versions_template" ON "versions" USING btree ("template_id","created_at");--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_owner" CHECK (("versions"."page_id" is null) <> ("versions"."template_id" is null));
--> statement-breakpoint
-- Templates: every member looks; owners and admins change, publish and delete them (as themes were).
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON templates, template_media TO uddokta_app;--> statement-breakpoint
CREATE POLICY templates_read ON templates FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY templates_manage ON templates FOR ALL TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin')) WITH CHECK (my_role(store_id) IN ('owner', 'admin'));--> statement-breakpoint
ALTER TABLE template_media ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY template_media_read ON template_media FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY template_media_manage ON template_media FOR ALL TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin')) WITH CHECK (my_role(store_id) IN ('owner', 'admin'));--> statement-breakpoint
ALTER TABLE template_media ADD CONSTRAINT template_media_media_fk FOREIGN KEY (store_id, media_id) REFERENCES media (store_id, id) DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- A product, collection or store page that picked a template falls back to the default when the template is deleted.
ALTER TABLE products ADD CONSTRAINT products_template FOREIGN KEY (store_id, template_id) REFERENCES templates (store_id, id) ON DELETE SET NULL (template_id);--> statement-breakpoint
ALTER TABLE collections ADD CONSTRAINT collections_template FOREIGN KEY (store_id, template_id) REFERENCES templates (store_id, id) ON DELETE SET NULL (template_id);--> statement-breakpoint
ALTER TABLE store_pages ADD CONSTRAINT store_pages_template FOREIGN KEY (store_id, template_id) REFERENCES templates (store_id, id) ON DELETE SET NULL (template_id);--> statement-breakpoint
-- What the storefront draws for one template type: the chosen template if it is published and of that type, else the
-- store's default for the type; nothing means the built-in template (storefront/src/site.ts).
CREATE FUNCTION storefront_template(store uuid, template_type text, chosen uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.published FROM templates t
  WHERE t.store_id = store AND t.type = template_type AND t.published IS NOT NULL AND (t.id = chosen OR t.is_default)
  ORDER BY (t.id = chosen) DESC NULLS LAST LIMIT 1
$$;--> statement-breakpoint
DROP FUNCTION storefront_store(text);--> statement-breakpoint
CREATE FUNCTION storefront_store(store_handle text)
RETURNS TABLE (id uuid, name text, theme text, site_style jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, name, theme, site_style FROM stores WHERE handle = store_handle
$$;--> statement-breakpoint
DROP FUNCTION storefront_product(uuid, text);--> statement-breakpoint
CREATE FUNCTION storefront_product(store uuid, product_handle text)
RETURNS TABLE (id uuid, name text, description text, seo_title text, seo_description text, status text, images jsonb, variants jsonb, template_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.name, p.description, p.seo_title, p.seo_description, p.status,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('key', m.key, 'alt', m.alt, 'width', m.width, 'height', m.height) ORDER BY pm.position)
      FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id), '[]'),
    (SELECT jsonb_agg(jsonb_build_object('id', v.id, 'options', v.options, 'price', v.price, 'comparePrice', v.compare_price, 'stock', v.stock) ORDER BY v.position)
      FROM product_variants v WHERE v.product_id = p.id),
    p.template_id
  FROM products p
  WHERE p.store_id = store AND p.handle = product_handle AND p.status IN ('active', 'unlisted')
$$;--> statement-breakpoint
DROP FUNCTION storefront_collections(uuid);--> statement-breakpoint
CREATE FUNCTION storefront_collections(store uuid)
RETURNS TABLE (id uuid, name text, handle text, description text, seo_title text, seo_description text, template_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name, c.handle, c.description, c.seo_title, c.seo_description, c.template_id FROM collections c
  WHERE c.store_id = store AND EXISTS (SELECT 1 FROM collection_products cp JOIN products p ON p.id = cp.product_id WHERE cp.collection_id = c.id AND p.status = 'active')
  ORDER BY c.name
$$;--> statement-breakpoint
DROP FUNCTION storefront_store_page(uuid, text);--> statement-breakpoint
CREATE FUNCTION storefront_store_page(store uuid, page_handle text)
RETURNS TABLE (id uuid, title text, body text, policy text, template_id uuid, seo_title text, seo_description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.title, p.body, p.policy, p.template_id, p.seo_title, p.seo_description
  FROM store_pages p WHERE p.store_id = store AND p.handle = page_handle AND p.visible AND (p.publish_at IS NULL OR p.publish_at <= now())
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_template, storefront_store, storefront_product, storefront_collections, storefront_store_page FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_template, storefront_store, storefront_product, storefront_collections, storefront_store_page TO uddokta_app;
