GRANT SELECT, INSERT, UPDATE, DELETE ON media TO uddokta_app;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

-- Any team member can use the gallery; only owners and admins can delete from it.
CREATE POLICY media_read ON media FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
CREATE POLICY media_add ON media FOR INSERT TO uddokta_app WITH CHECK (my_role(store_id) IS NOT NULL);
CREATE POLICY media_change ON media FOR UPDATE TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
CREATE POLICY media_remove ON media FOR DELETE TO uddokta_app USING (my_role(store_id) IN ('owner', 'admin'));
