GRANT SELECT, INSERT, UPDATE, DELETE ON courier_accounts, shipments TO uddokta_app;
--> statement-breakpoint
ALTER TABLE courier_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY courier_accounts_read ON courier_accounts FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY courier_accounts_add ON courier_accounts FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
CREATE POLICY courier_accounts_change ON courier_accounts FOR UPDATE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin')) WITH CHECK (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
CREATE POLICY courier_accounts_remove ON courier_accounts FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));
--> statement-breakpoint
CREATE POLICY shipments_member ON shipments FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
