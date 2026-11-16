ALTER TABLE "templates" ADD COLUMN "built_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "templates_store_built_in" ON "templates" USING btree ("store_id","type") WHERE "templates"."built_in";--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_built_in_published" CHECK (not "templates"."built_in" or "templates"."published" is not null);--> statement-breakpoint
-- Built-in templates are edited like any other but never deleted (a store's own deletion still cascades), and a row
-- never becomes or stops being built in.
DROP POLICY templates_manage ON templates;--> statement-breakpoint
CREATE POLICY templates_insert ON templates FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IN ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY templates_update ON templates FOR UPDATE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin')) WITH CHECK (my_role(store_id) IN ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY templates_delete ON templates FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin') AND NOT built_in);--> statement-breakpoint
CREATE FUNCTION templates_keep_built_in() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.built_in IS DISTINCT FROM OLD.built_in THEN RAISE EXCEPTION 'built_in cannot change' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER templates_keep_built_in BEFORE UPDATE OF built_in ON templates FOR EACH ROW EXECUTE FUNCTION templates_keep_built_in();--> statement-breakpoint
-- What the storefront draws: the chosen template if published and of the type, else the default, else the store's
-- built-in copy; nothing means the built-in template in code (storefront/src/site.ts).
CREATE OR REPLACE FUNCTION storefront_template(store uuid, template_type text, chosen uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.published FROM templates t
  WHERE t.store_id = store AND t.type = template_type AND t.published IS NOT NULL AND (t.id = chosen OR t.is_default OR t.built_in)
  ORDER BY (t.id = chosen) DESC NULLS LAST, t.is_default DESC, t.built_in DESC LIMIT 1
$$;
