CREATE TABLE "attribute_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "attribute_choices_attribute_id" UNIQUE("attribute_id","id"),
	CONSTRAINT "attribute_choices_label_length" CHECK (char_length(btrim("attribute_choices"."label")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"show_on_product" boolean DEFAULT true NOT NULL,
	"filterable" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attributes_store_id" UNIQUE("store_id","id"),
	CONSTRAINT "attributes_kind" CHECK ("attributes"."kind" in ('choice', 'number', 'flag')),
	CONSTRAINT "attributes_text" CHECK (char_length(btrim("attributes"."name")) between 1 and 60 and char_length("attributes"."unit") <= 20 and ("attributes"."kind" = 'number' or "attributes"."unit" = ''))
);
--> statement-breakpoint
CREATE TABLE "product_attribute_values" (
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"choice_id" uuid,
	"number" numeric(12, 3),
	"flag" boolean,
	CONSTRAINT "product_attribute_values_one" CHECK (num_nonnulls("product_attribute_values"."choice_id", "product_attribute_values"."number", "product_attribute_values"."flag") = 1)
);
--> statement-breakpoint
ALTER TABLE "attribute_choices" ADD CONSTRAINT "attribute_choices_attribute" FOREIGN KEY ("store_id","attribute_id") REFERENCES "public"."attributes"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute" FOREIGN KEY ("store_id","attribute_id") REFERENCES "public"."attributes"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_choice" FOREIGN KEY ("attribute_id","choice_id") REFERENCES "public"."attribute_choices"("attribute_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_choices_label" ON "attribute_choices" USING btree ("attribute_id",lower("label"));--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_store_name" ON "attributes" USING btree ("store_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "product_attribute_values_choice_once" ON "product_attribute_values" USING btree ("product_id","attribute_id","choice_id") WHERE "product_attribute_values"."choice_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_attribute_values_single" ON "product_attribute_values" USING btree ("product_id","attribute_id") WHERE "product_attribute_values"."choice_id" is null;--> statement-breakpoint
CREATE INDEX "product_attribute_values_attribute" ON "product_attribute_values" USING btree ("store_id","attribute_id","choice_id");--> statement-breakpoint
-- Like collections: any team member adds and edits attributes and product values; only owners and admins delete an attribute.
GRANT SELECT, INSERT, UPDATE, DELETE ON attributes, attribute_choices, product_attribute_values TO uddokta_app;--> statement-breakpoint
ALTER TABLE attributes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE attribute_choices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_attribute_values ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY attributes_read ON attributes FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY attributes_add ON attributes FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY attributes_change ON attributes FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY attributes_remove ON attributes FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY attribute_choices_member ON attribute_choices FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY product_attribute_values_member ON product_attribute_values FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
-- One rule for search words, used by search and by filtered listings: every word appears in the name, type, brand, a tag,
-- an attribute choice or a variant option value.
CREATE FUNCTION storefront_matches(product uuid, words text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM regexp_split_to_table(btrim(coalesce(words, '')), '\s+') w
    WHERE w <> '' AND NOT EXISTS (
      SELECT 1 FROM products p WHERE p.id = product AND (p.name ILIKE '%' || w || '%' OR p.product_type ILIKE '%' || w || '%' OR p.brand ILIKE '%' || w || '%'
        OR EXISTS (SELECT 1 FROM unnest(p.tags) tg WHERE tg ILIKE '%' || w || '%')
        OR EXISTS (SELECT 1 FROM product_attribute_values av JOIN attribute_choices c ON c.id = av.choice_id WHERE av.product_id = p.id AND c.label ILIKE '%' || w || '%')
        OR EXISTS (SELECT 1 FROM product_variants pv, unnest(pv.options) o WHERE pv.product_id = p.id AND o ILIKE '%' || w || '%'))))
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION storefront_search(store uuid, words text, page_size integer)
RETURNS TABLE (id uuid, name text, handle text, min_price integer, compare_price integer, image_key text, image_alt text, image_width integer, image_height integer, in_stock boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.name, p.handle, v.min_price, v.compare_price, i.key, i.alt, i.width, i.height, v.in_stock
  FROM products p
  CROSS JOIN LATERAL (SELECT min(price)::int AS min_price, max(compare_price)::int AS compare_price, bool_or(stock IS NULL OR stock > 0) AS in_stock FROM product_variants WHERE product_id = p.id) v
  LEFT JOIN LATERAL (SELECT m.key, m.alt, m.width, m.height FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id ORDER BY pm.position LIMIT 1) i ON true
  WHERE p.store_id = store AND p.status = 'active' AND storefront_matches(p.id, words)
  ORDER BY p.name
  LIMIT page_size
$$;--> statement-breakpoint
-- What a filtered listing works from: the listed products of a collection, of the store, or matching search words, in
-- the listing's order, each with its lowest price, whether it is in stock and its filterable attribute values.
-- ponytail: up to 2000 products are filtered in the storefront; move filtering into SQL if a store lists more.
CREATE FUNCTION storefront_filter_rows(store uuid, collection uuid, words text)
RETURNS TABLE (id uuid, min_price integer, in_stock boolean, attrs jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, v.min_price, v.in_stock,
    coalesce((SELECT jsonb_agg(jsonb_build_array(av.attribute_id, av.choice_id, av.number, av.flag)) FROM product_attribute_values av
      JOIN attributes a ON a.id = av.attribute_id AND a.filterable WHERE av.product_id = p.id), '[]'::jsonb)
  FROM products p
  CROSS JOIN LATERAL (SELECT min(price)::int AS min_price, bool_or(stock IS NULL OR stock > 0) AS in_stock FROM product_variants WHERE product_id = p.id) v
  LEFT JOIN collection_products cp ON cp.product_id = p.id AND cp.collection_id = collection
  WHERE p.store_id = store AND p.status = 'active' AND (collection IS NULL OR cp.collection_id IS NOT NULL) AND (words IS NULL OR storefront_matches(p.id, words))
  ORDER BY CASE WHEN words IS NOT NULL THEN 0 WHEN collection IS NULL THEN 0 ELSE cp.position END, CASE WHEN words IS NOT NULL THEN p.name END, p.created_at DESC, p.id
  LIMIT 2000
$$;--> statement-breakpoint
-- Product cards for the given listed products, in the given order.
CREATE FUNCTION storefront_cards(store uuid, ids uuid[])
RETURNS TABLE (id uuid, name text, handle text, min_price integer, compare_price integer, image_key text, image_alt text, image_width integer, image_height integer, in_stock boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.name, p.handle, v.min_price, v.compare_price, i.key, i.alt, i.width, i.height, v.in_stock
  FROM unnest(ids) WITH ORDINALITY AS wanted(id, n)
  JOIN products p ON p.id = wanted.id AND p.store_id = store AND p.status = 'active'
  CROSS JOIN LATERAL (SELECT min(price)::int AS min_price, max(compare_price)::int AS compare_price, bool_or(stock IS NULL OR stock > 0) AS in_stock FROM product_variants WHERE product_id = p.id) v
  LEFT JOIN LATERAL (SELECT m.key, m.alt, m.width, m.height FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id ORDER BY pm.position LIMIT 1) i ON true
  ORDER BY wanted.n
  LIMIT 100
$$;--> statement-breakpoint
-- The store's filterable attributes with their choices, in the seller's order.
CREATE FUNCTION storefront_filter_attributes(store uuid)
RETURNS TABLE (id uuid, name text, kind text, unit text, choices jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.name, a.kind, a.unit,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label) ORDER BY c.position, c.label) FROM attribute_choices c WHERE c.attribute_id = a.id), '[]'::jsonb)
  FROM attributes a WHERE a.store_id = store AND a.filterable ORDER BY a.position, a.name
$$;--> statement-breakpoint
-- A product's attributes for its page (those shown on product pages), in the seller's order.
CREATE FUNCTION storefront_product_attributes(store uuid, product uuid)
RETURNS TABLE (name text, kind text, unit text, choices text[], number numeric, flag boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.name, a.kind, a.unit,
    array_remove(array_agg(c.label ORDER BY c.position, c.label), NULL), max(av.number), bool_or(av.flag)
  FROM product_attribute_values av
  JOIN attributes a ON a.id = av.attribute_id AND a.show_on_product
  JOIN products p ON p.id = av.product_id AND p.store_id = store AND p.status <> 'draft'
  LEFT JOIN attribute_choices c ON c.id = av.choice_id
  WHERE av.store_id = store AND av.product_id = product
  GROUP BY a.id, a.name, a.kind, a.unit, a.position
  ORDER BY a.position, a.name
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION storefront_matches, storefront_filter_rows, storefront_cards, storefront_filter_attributes, storefront_product_attributes FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION storefront_matches, storefront_filter_rows, storefront_cards, storefront_filter_attributes, storefront_product_attributes TO uddokta_app;
