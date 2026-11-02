GRANT SELECT, INSERT, UPDATE, DELETE ON warehouses TO uddokta_app;
--> statement-breakpoint
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Any team member can add and edit warehouses; only owners and admins can delete them.
CREATE POLICY warehouses_read ON warehouses FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY warehouses_add ON warehouses FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY warehouses_change ON warehouses FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY warehouses_remove ON warehouses FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));
