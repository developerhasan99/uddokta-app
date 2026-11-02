ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_store_id" UNIQUE("store_id","id");--> statement-breakpoint
CREATE TABLE "warehouse_stock" (
	"store_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "warehouse_stock_warehouse_id_variant_id_pk" PRIMARY KEY("warehouse_id","variant_id"),
	CONSTRAINT "warehouse_stock_quantity" CHECK ("warehouse_stock"."quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_warehouse" FOREIGN KEY ("store_id","warehouse_id") REFERENCES "public"."warehouses"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_variant" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warehouse_stock_variant_idx" ON "warehouse_stock" USING btree ("variant_id");