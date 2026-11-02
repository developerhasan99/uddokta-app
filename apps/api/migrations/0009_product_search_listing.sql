ALTER TABLE "products" ADD COLUMN "handle" text;--> statement-breakpoint
-- Existing products get an address from their name. Repeats get part of their id, which cannot clash.
UPDATE products p SET handle = CASE WHEN s.n = 1 THEN s.base ELSE s.base || '-' || left(p.id::text, 8) END
FROM (
  SELECT id, base, row_number() OVER (PARTITION BY store_id, base ORDER BY created_at, id) AS n
  FROM (
    SELECT id, store_id, created_at, coalesce(nullif(left(trim(both '-' FROM regexp_replace(lower(name), E'[^a-z0-9\\u0980-\\u09F1\\u200c\\u200d]+', '-', 'g')), 100), ''), 'product') AS base
    FROM products
  ) named
) s
WHERE p.id = s.id;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "handle" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_handle" UNIQUE("store_id","handle");