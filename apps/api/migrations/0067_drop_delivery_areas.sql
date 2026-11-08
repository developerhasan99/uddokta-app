-- Every store's two old charges become its first two delivery options, and every order points at the one it used,
-- with the name copied, before the old columns go.
INSERT INTO "shipping_rates" ("store_id", "name", "price", "position")
SELECT "id", 'ঢাকার ভেতরে', coalesce("delivery_inside", 70), 0 FROM "stores";--> statement-breakpoint
INSERT INTO "shipping_rates" ("store_id", "name", "price", "position")
SELECT "id", 'ঢাকার বাইরে', coalesce("delivery_outside", 130), 1 FROM "stores";--> statement-breakpoint
UPDATE "orders" o SET "shipping_rate_id" = r."id", "shipping_name" = r."name"
FROM "shipping_rates" r WHERE r."store_id" = o."store_id" AND r."position" = CASE WHEN o."area" = 'outside' THEN 1 ELSE 0 END;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "area";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "delivery_inside";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "delivery_outside";
