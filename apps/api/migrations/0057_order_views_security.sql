ALTER TABLE order_views ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON order_views TO uddokta_app;
--> statement-breakpoint
CREATE POLICY order_views_own ON order_views FOR ALL TO uddokta_app
  USING (user_id = current_user_id() AND my_role(store_id) IS NOT NULL)
  WITH CHECK (user_id = current_user_id() AND my_role(store_id) IS NOT NULL);
