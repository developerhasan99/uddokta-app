ALTER TABLE "media" ADD COLUMN "source_format" text;--> statement-breakpoint
UPDATE media SET source_format = CASE lower(substring(name from '\.([^.]+)$'))
  WHEN 'jpg' THEN 'jpeg' WHEN 'jpeg' THEN 'jpeg' WHEN 'png' THEN 'png' WHEN 'webp' THEN 'webp' WHEN 'avif' THEN 'avif'
END;
