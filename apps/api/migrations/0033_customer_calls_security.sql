GRANT SELECT, INSERT ON customer_calls TO uddokta_app;
--> statement-breakpoint
ALTER TABLE customer_calls ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Members log calls as themselves; the log is kept as it was, so there is no update or delete.
CREATE POLICY customer_calls_read ON customer_calls FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY customer_calls_add ON customer_calls FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL AND user_id = current_user_id());
