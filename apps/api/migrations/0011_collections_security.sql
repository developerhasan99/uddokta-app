-- Deferred to commit: deleting a store removes its collections and media in an undefined order,
-- and only the final state matters. Deleting an image still in use fails here.
ALTER TABLE collections ADD CONSTRAINT collections_media_fk FOREIGN KEY (store_id, media_id) REFERENCES media (store_id, id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON collections, collection_products TO uddokta_app;
--> statement-breakpoint
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE collection_products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Any team member can add and edit collections; only owners and admins can delete them.
CREATE POLICY collections_read ON collections FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY collections_add ON collections FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY collections_change ON collections FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY collections_remove ON collections FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
CREATE POLICY collection_products_member ON collection_products FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
