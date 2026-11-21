-- Platform administrators change a team member's role or take them off a store, with a reason in the audit log. A store
-- always keeps an owner: the deferred member_change_keeps_owner trigger refuses the change at commit (UD001, lastOwner).
CREATE FUNCTION console_set_member_role(admin uuid, store uuid, member uuid, member_role text, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
  person users;
  was text;
BEGIN
  PERFORM console_check(admin);
  IF member_role NOT IN ('owner', 'admin', 'staff') THEN RAISE EXCEPTION 'unknown role' USING ERRCODE = '22023'; END IF;
  SELECT * INTO target FROM stores WHERE id = store;
  SELECT * INTO person FROM users WHERE id = member;
  SELECT role INTO was FROM store_members WHERE store_id = store AND user_id = member FOR UPDATE;
  IF target.id IS NULL OR person.id IS NULL OR was IS NULL THEN RAISE EXCEPTION 'no such member' USING ERRCODE = 'UD100'; END IF;
  UPDATE store_members SET role = member_role WHERE store_id = store AND user_id = member;
  PERFORM console_log(admin, 'store.memberRole', 'store', store, target.name || ' (' || target.handle || ')',
    jsonb_build_object('email', person.email, 'from', was, 'role', member_role), why);
END $$;--> statement-breakpoint
CREATE FUNCTION console_remove_member(admin uuid, store uuid, member uuid, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
  person users;
  was text;
BEGIN
  PERFORM console_check(admin);
  SELECT * INTO target FROM stores WHERE id = store;
  SELECT * INTO person FROM users WHERE id = member;
  DELETE FROM store_members WHERE store_id = store AND user_id = member RETURNING role INTO was;
  IF target.id IS NULL OR person.id IS NULL OR was IS NULL THEN RAISE EXCEPTION 'no such member' USING ERRCODE = 'UD100'; END IF;
  PERFORM console_log(admin, 'store.memberRemove', 'store', store, target.name || ' (' || target.handle || ')',
    jsonb_build_object('email', person.email, 'role', was), why);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION console_set_member_role, console_remove_member FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION console_set_member_role, console_remove_member TO uddokta_app;
