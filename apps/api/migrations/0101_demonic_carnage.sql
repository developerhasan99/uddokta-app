CREATE TABLE "demo_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"template_type" text,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thumb_key" text,
	"preview_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"source_store_id" uuid,
	"source_id" uuid,
	"source_section" text,
	"version" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_items_kind" CHECK ("demo_items"."kind" in ('landing', 'template', 'section')),
	CONSTRAINT "demo_items_template_type" CHECK (("demo_items"."kind" = 'template') = ("demo_items"."template_type" is not null)),
	CONSTRAINT "demo_items_section" CHECK (("demo_items"."kind" = 'section') = ("demo_items"."source_section" is not null) or "demo_items"."source_id" is null),
	CONSTRAINT "demo_items_status" CHECK ("demo_items"."status" in ('draft', 'published')),
	CONSTRAINT "demo_items_names" CHECK (length(btrim("demo_items"."name_bn")) between 1 and 80 and length(btrim("demo_items"."name_en")) between 1 and 80 and length("demo_items"."category") <= 40)
);
--> statement-breakpoint
ALTER TABLE "demo_items" ADD CONSTRAINT "demo_items_source_store_id_stores_id_fk" FOREIGN KEY ("source_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_items_list" ON "demo_items" USING btree ("kind","status","sort");--> statement-breakpoint
-- ---- Demos. The app role gets no grant on demo_items: sellers read published demos through demo_list/demo_take, the
-- console changes them through console_* functions that check the administrator and write the audit log.
ALTER TABLE demo_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON demo_items FROM PUBLIC;--> statement-breakpoint
-- Published demos of one kind (and template type), for the galleries. No content: that is taken one at a time.
CREATE FUNCTION demo_list(want_kind text, want_type text) RETURNS TABLE (id uuid, kind text, template_type text, name_bn text, name_en text, category text, thumb_key text, preview_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, d.kind, d.template_type, d.name_bn, d.name_en, d.category, d.thumb_key, d.preview_url FROM demo_items d
  WHERE d.status = 'published' AND d.kind = want_kind AND (want_type IS NULL OR d.template_type = want_type)
  ORDER BY d.sort, d.created_at DESC
$$;--> statement-breakpoint
-- A published demo's content and images, to copy into a store; counts the use.
CREATE FUNCTION demo_take(demo uuid, want_kind text) RETURNS TABLE (template_type text, content jsonb, media jsonb)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE demo_items d SET uses = d.uses + 1 WHERE d.id = demo AND d.kind = want_kind AND d.status = 'published'
  RETURNING d.template_type, d.content, d.media
$$;--> statement-breakpoint
CREATE FUNCTION console_demos(admin uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', d.id, 'kind', d.kind, 'templateType', d.template_type, 'nameBn', d.name_bn, 'nameEn', d.name_en, 'category', d.category,
    'thumbKey', d.thumb_key, 'previewUrl', d.preview_url, 'status', d.status, 'sort', d.sort, 'version', d.version, 'uses', d.uses,
    'images', jsonb_array_length(d.media), 'sourceStoreId', d.source_store_id, 'sourceStore', s.handle, 'sourceId', d.source_id,
    'sourceSection', d.source_section, 'updatedAt', d.updated_at) ORDER BY d.kind, d.sort, d.created_at DESC)
    FROM demo_items d LEFT JOIN stores s ON s.id = d.source_store_id), '[]'::jsonb);
END $$;--> statement-breakpoint
-- What a store offers as demo sources: its landing pages and templates (with their sections, by name) and its newest images
-- (for the thumbnail). Drafts are what is taken, so the team can save without publishing.
CREATE FUNCTION console_demo_sources(admin uuid, store_handle text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s stores;
BEGIN
  PERFORM console_check(admin);
  SELECT * INTO s FROM stores WHERE handle = lower(btrim(store_handle));
  IF s.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'store', jsonb_build_object('id', s.id, 'handle', s.handle, 'name', s.name),
    'pages', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'sections',
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', x->>'id', 'name', coalesce(x->'settings'->>'name', '')) ORDER BY n) FROM jsonb_array_elements(p.draft->'sections') WITH ORDINALITY AS e(x, n)), '[]'::jsonb))
      ORDER BY p.updated_at DESC) FROM pages p WHERE p.store_id = s.id), '[]'::jsonb),
    'templates', coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'type', t.type, 'builtIn', t.built_in, 'sections',
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', x->>'id', 'name', coalesce(x->'settings'->>'name', '')) ORDER BY n) FROM jsonb_array_elements(t.draft->'sections') WITH ORDINALITY AS e(x, n)), '[]'::jsonb))
      ORDER BY t.type, t.updated_at DESC) FROM templates t WHERE t.store_id = s.id), '[]'::jsonb),
    'images', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'key', m.key, 'thumbKey', m.thumb_key) ORDER BY m.created_at DESC)
      FROM (SELECT * FROM media WHERE store_id = s.id ORDER BY created_at DESC LIMIT 60) m), '[]'::jsonb));
END $$;--> statement-breakpoint
-- One source's draft, and the details of the store's images it names (the console copies them).
CREATE FUNCTION console_demo_source(admin uuid, store uuid, source_kind text, source uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  IF source_kind = 'page' THEN
    RETURN (SELECT jsonb_build_object('title', p.title, 'type', NULL, 'content', p.draft) FROM pages p WHERE p.store_id = store AND p.id = source);
  END IF;
  RETURN (SELECT jsonb_build_object('title', t.title, 'type', t.type, 'content', t.draft) FROM templates t WHERE t.store_id = store AND t.id = source);
END $$;--> statement-breakpoint
CREATE FUNCTION console_demo_files(admin uuid, store uuid, ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'key', m.key, 'thumbKey', m.thumb_key, 'name', m.name, 'alt', m.alt,
    'width', m.width, 'height', m.height, 'sourceFormat', m.source_format)) FROM media m WHERE m.store_id = store AND m.id = ANY(ids)), '[]'::jsonb);
END $$;--> statement-breakpoint
-- Creates or changes a demo. Details always carry the names, category, preview link, status and order; a snapshot also
-- carries content, media and source (and raises the version); thumbKey is set when present (null clears it).
CREATE FUNCTION console_save_demo(admin uuid, demo uuid, details jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  snapshot boolean := details ? 'content';
  existed boolean;
BEGIN
  PERFORM console_check(admin);
  SELECT true INTO existed FROM demo_items WHERE id = demo;
  IF existed IS NULL THEN
    IF NOT snapshot THEN RAISE EXCEPTION 'a new demo needs content' USING ERRCODE = '22023'; END IF;
    INSERT INTO demo_items (id, kind, template_type, name_bn, name_en, category, content, media, thumb_key, preview_url, status, sort, source_store_id, source_id, source_section)
    VALUES (demo, details->>'kind', details->>'templateType', btrim(details->>'nameBn'), btrim(details->>'nameEn'), coalesce(details->>'category', ''),
      details->'content', details->'media', details->>'thumbKey', coalesce(details->>'previewUrl', ''), coalesce(details->>'status', 'draft'),
      coalesce((details->>'sort')::integer, 0), (details->>'sourceStoreId')::uuid, (details->>'sourceId')::uuid, details->>'sourceSection');
  ELSE
    UPDATE demo_items SET name_bn = btrim(details->>'nameBn'), name_en = btrim(details->>'nameEn'), category = coalesce(details->>'category', ''),
      preview_url = coalesce(details->>'previewUrl', ''), status = coalesce(details->>'status', status), sort = coalesce((details->>'sort')::integer, sort),
      thumb_key = CASE WHEN details ? 'thumbKey' THEN details->>'thumbKey' ELSE thumb_key END,
      content = CASE WHEN snapshot THEN details->'content' ELSE content END,
      media = CASE WHEN snapshot THEN details->'media' ELSE media END,
      template_type = CASE WHEN snapshot THEN details->>'templateType' ELSE template_type END,
      source_store_id = CASE WHEN snapshot THEN (details->>'sourceStoreId')::uuid ELSE source_store_id END,
      source_id = CASE WHEN snapshot THEN (details->>'sourceId')::uuid ELSE source_id END,
      source_section = CASE WHEN snapshot THEN details->>'sourceSection' ELSE source_section END,
      version = version + CASE WHEN snapshot THEN 1 ELSE 0 END, updated_at = now()
    WHERE id = demo;
  END IF;
  PERFORM console_log(admin, CASE WHEN existed IS NULL THEN 'demo.create' WHEN snapshot THEN 'demo.snapshot' ELSE 'demo.update' END, 'demo', demo,
    btrim(details->>'nameEn'), (details - 'content' - 'media'), '');
END $$;--> statement-breakpoint
-- Deletes a demo and returns its file keys, so the console can remove the copies. Pages made from it keep their own.
CREATE FUNCTION console_delete_demo(admin uuid, demo uuid, why text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  gone demo_items;
BEGIN
  PERFORM console_check(admin);
  DELETE FROM demo_items WHERE id = demo RETURNING * INTO gone;
  IF gone.id IS NULL THEN RETURN NULL; END IF;
  PERFORM console_log(admin, 'demo.delete', 'demo', demo, gone.name_en, jsonb_build_object('kind', gone.kind, 'uses', gone.uses), why);
  RETURN jsonb_build_object('media', gone.media, 'thumbKey', gone.thumb_key);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION demo_list, demo_take, console_demos, console_demo_sources, console_demo_source, console_demo_files, console_save_demo, console_delete_demo FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION demo_list, demo_take, console_demos, console_demo_sources, console_demo_source, console_demo_files, console_save_demo, console_delete_demo TO uddokta_app;
