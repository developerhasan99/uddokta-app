-- Content width's default is now 1200px. Until now the setting was saved but never drawn, so stores still on the old
-- 1100px default move to 1200px; any other width a seller chose stays.
UPDATE stores SET site_style = jsonb_set(site_style, '{width}', '1200'::jsonb) WHERE site_style IS NOT NULL AND site_style->>'width' = '1100';
