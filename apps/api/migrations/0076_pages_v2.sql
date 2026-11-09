-- Page content version 2 (layout sections). Version 1 pages are valid version 2 pages, so only the number changes.
UPDATE "pages" SET "draft" = jsonb_set("draft", '{version}', '2') WHERE "draft"->>'version' = '1';
--> statement-breakpoint
UPDATE "pages" SET "published" = jsonb_set("published", '{version}', '2') WHERE "published"->>'version' = '1';
