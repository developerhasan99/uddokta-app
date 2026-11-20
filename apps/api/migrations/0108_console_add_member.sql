-- Platform administrators add an existing account to any store's team, with a role and a reason in the audit log.
-- Bypasses the plan's member limit on purpose (the console is where exceptions are made).
CREATE FUNCTION console_add_member(admin uuid, store uuid, address text, member_role text, why text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target stores;
  person users;
BEGIN
  PERFORM console_check(admin);
  IF member_role NOT IN ('owner', 'admin', 'staff') THEN RAISE EXCEPTION 'unknown role' USING ERRCODE = '22023'; END IF;
  SELECT * INTO target FROM stores WHERE id = store;
  IF target.id IS NULL THEN RAISE EXCEPTION 'no such store' USING ERRCODE = 'UD100'; END IF;
  SELECT * INTO person FROM users WHERE lower(email) = lower(btrim(address));
  IF person.id IS NULL THEN RAISE EXCEPTION 'no such account' USING ERRCODE = 'UD105'; END IF;
  IF EXISTS (SELECT 1 FROM store_members WHERE store_id = store AND user_id = person.id) THEN RAISE EXCEPTION 'already a member' USING ERRCODE = 'UD106'; END IF;
  INSERT INTO store_members (store_id, user_id, role) VALUES (store, person.id, member_role);
  PERFORM console_log(admin, 'store.addMember', 'store', store, target.name || ' (' || target.handle || ')',
    jsonb_build_object('email', person.email, 'role', member_role), why);
  RETURN jsonb_build_object('id', person.id, 'name', person.name);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION console_add_member FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION console_add_member TO uddokta_app;
