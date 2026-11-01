-- Deferred to commit: deleting a store removes its products and media in an undefined order,
-- and only the final state matters. Deleting an image still in use fails here.
ALTER TABLE product_media ADD CONSTRAINT product_media_media_fk FOREIGN KEY (store_id, media_id) REFERENCES media (store_id, id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON products, product_variants, product_variant_costs, product_media TO uddokta_app;
--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE product_variant_costs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Any team member can add and edit products; only owners and admins can delete them.
CREATE POLICY products_read ON products FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY products_add ON products FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY products_change ON products FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY products_remove ON products FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
CREATE POLICY product_variants_member ON product_variants FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY product_media_member ON product_media FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
-- Buying prices: owners and admins only.
CREATE POLICY product_variant_costs_managers ON product_variant_costs FOR ALL TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin')) WITH CHECK (my_role(store_id) IN ('owner', 'admin'));
