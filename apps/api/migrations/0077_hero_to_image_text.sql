-- The Hero banner block was retired. Saved pages that use it (as a block or an old top-level section, in the draft or the
-- published copy) become "Image with text", which has the same heading, text, image, layout, button, icon and link
-- settings (the hero's small eyebrow line is dropped when the page is next read). In jsonb text a type value appears
-- exactly as "type": "hero"; inside page text the quotes would be escaped, so only real type values match.
UPDATE pages SET draft = replace(draft::text, '"type": "hero"', '"type": "imageText"')::jsonb WHERE draft::text LIKE '%"type": "hero"%';
--> statement-breakpoint
UPDATE pages SET published = replace(published::text, '"type": "hero"', '"type": "imageText"')::jsonb WHERE published IS NOT NULL AND published::text LIKE '%"type": "hero"%';
