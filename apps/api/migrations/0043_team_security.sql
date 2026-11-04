GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO uddokta_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON shifts TO uddokta_app;
--> statement-breakpoint
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- A task can only be given to someone in the same store.
CREATE POLICY tasks_member ON tasks FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL)
  WITH CHECK (my_role(store_id) IS NOT NULL AND (assignee_id IS NULL OR EXISTS (SELECT 1 FROM store_members m WHERE m.store_id = tasks.store_id AND m.user_id = assignee_id)));
--> statement-breakpoint
CREATE POLICY shifts_read ON shifts FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY shifts_own_start ON shifts FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL AND user_id = current_user_id());
--> statement-breakpoint
CREATE POLICY shifts_own_end ON shifts FOR UPDATE TO uddokta_app USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());
--> statement-breakpoint
-- At most one open shift per person per store.
CREATE UNIQUE INDEX shifts_one_open ON shifts (store_id, user_id) WHERE ended_at IS NULL;
