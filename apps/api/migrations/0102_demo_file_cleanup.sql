-- console_save_demo now returns the demo's files before and after the save ({ before, after }, each { thumbKey, media }),
-- so the console deletes the ones no longer used (a replaced or removed thumbnail, images a new snapshot dropped).
DROP FUNCTION console_save_demo(uuid, uuid, jsonb);--> statement-breakpoint
CREATE FUNCTION console_save_demo(admin uuid, demo uuid, details jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  snapshot boolean := details ? 'content';
  old demo_items;
  saved demo_items;
BEGIN
  PERFORM console_check(admin);
  SELECT * INTO old FROM demo_items WHERE id = demo FOR UPDATE;
  IF old.id IS NULL THEN
    IF NOT snapshot THEN RAISE EXCEPTION 'a new demo needs content' USING ERRCODE = '22023'; END IF;
    INSERT INTO demo_items (id, kind, template_type, name_bn, name_en, category, content, media, thumb_key, preview_url, status, sort, source_store_id, source_id, source_section)
    VALUES (demo, details->>'kind', details->>'templateType', btrim(details->>'nameBn'), btrim(details->>'nameEn'), coalesce(details->>'category', ''),
      details->'content', details->'media', details->>'thumbKey', coalesce(details->>'previewUrl', ''), coalesce(details->>'status', 'draft'),
      coalesce((details->>'sort')::integer, 0), (details->>'sourceStoreId')::uuid, (details->>'sourceId')::uuid, details->>'sourceSection')
    RETURNING * INTO saved;
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
    WHERE id = demo RETURNING * INTO saved;
  END IF;
  PERFORM console_log(admin, CASE WHEN old.id IS NULL THEN 'demo.create' WHEN snapshot THEN 'demo.snapshot' ELSE 'demo.update' END, 'demo', demo,
    btrim(details->>'nameEn'), (details - 'content' - 'media'), '');
  RETURN jsonb_build_object(
    'before', jsonb_build_object('thumbKey', old.thumb_key, 'media', coalesce(old.media, '[]'::jsonb)),
    'after', jsonb_build_object('thumbKey', saved.thumb_key, 'media', saved.media));
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION console_save_demo FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION console_save_demo TO uddokta_app;
