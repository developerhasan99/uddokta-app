ALTER TABLE "demo_items" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "demo_items_one_default" ON "demo_items" USING btree ("template_type") WHERE "demo_items"."is_default";--> statement-breakpoint
ALTER TABLE "demo_items" ADD CONSTRAINT "demo_items_default_published" CHECK (not "demo_items"."is_default" or ("demo_items"."kind" = 'template' and "demo_items"."status" = 'published'));--> statement-breakpoint
-- The list also says which template demos are the defaults for new stores.
CREATE OR REPLACE FUNCTION console_demos(admin uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', d.id, 'kind', d.kind, 'templateType', d.template_type, 'nameBn', d.name_bn, 'nameEn', d.name_en, 'category', d.category,
    'thumbKey', d.thumb_key, 'previewUrl', d.preview_url, 'status', d.status, 'sort', d.sort, 'version', d.version, 'uses', d.uses,
    'images', jsonb_array_length(d.media), 'sourceStoreId', d.source_store_id, 'sourceStore', s.handle, 'sourceId', d.source_id,
    'sourceSection', d.source_section, 'isDefault', d.is_default, 'updatedAt', d.updated_at) ORDER BY d.kind, d.sort, d.created_at DESC)
    FROM demo_items d LEFT JOIN stores s ON s.id = d.source_store_id), '[]'::jsonb);
END $$;--> statement-breakpoint
-- Makes a published template demo the default of its type; the previous default becomes an ordinary demo.
CREATE FUNCTION console_set_default_demo(admin uuid, demo uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d demo_items;
BEGIN
  PERFORM console_check(admin);
  SELECT * INTO d FROM demo_items WHERE id = demo FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'no such demo' USING ERRCODE = 'P0002'; END IF;
  IF d.kind <> 'template' OR d.status <> 'published' THEN
    RAISE EXCEPTION 'only a published template demo can be a default' USING ERRCODE = '23514', CONSTRAINT = 'demo_items_default_published';
  END IF;
  UPDATE demo_items SET is_default = false WHERE template_type = d.template_type AND is_default AND id <> demo;
  UPDATE demo_items SET is_default = true, updated_at = now() WHERE id = demo;
  PERFORM console_log(admin, 'demo.default', 'demo', demo, d.name_en, jsonb_build_object('templateType', d.template_type), '');
END $$;--> statement-breakpoint
-- A default cannot be deleted: another demo of its type must become the default first.
CREATE OR REPLACE FUNCTION console_delete_demo(admin uuid, demo uuid, why text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  gone demo_items;
BEGIN
  PERFORM console_check(admin);
  IF EXISTS (SELECT 1 FROM demo_items WHERE id = demo AND is_default) THEN
    RAISE EXCEPTION 'the default cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'demo_items_default_published';
  END IF;
  DELETE FROM demo_items WHERE id = demo RETURNING * INTO gone;
  IF gone.id IS NULL THEN RETURN NULL; END IF;
  PERFORM console_log(admin, 'demo.delete', 'demo', demo, gone.name_en, jsonb_build_object('kind', gone.kind, 'uses', gone.uses), why);
  RETURN jsonb_build_object('media', gone.media, 'thumbKey', gone.thumb_key);
END $$;--> statement-breakpoint
-- The default template demos, for a new store's built-in templates (the API copies them in after creating the store).
CREATE FUNCTION demo_defaults() RETURNS TABLE (template_type text, content jsonb, media jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.template_type, d.content, d.media FROM demo_items d WHERE d.is_default AND d.status = 'published'
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION console_set_default_demo, demo_defaults FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION console_set_default_demo, demo_defaults TO uddokta_app;
