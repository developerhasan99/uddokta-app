-- The API connects, then drops to this role for every request. It has no direct access to
-- credentials, sessions or login failures, and row-level security applies to everything else.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uddokta_app') THEN
    CREATE ROLE uddokta_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT uddokta_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO uddokta_app;
GRANT SELECT ON users TO uddokta_app;
GRANT SELECT, INSERT, UPDATE ON stores TO uddokta_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON store_members TO uddokta_app;
GRANT SELECT, INSERT, DELETE ON store_invites TO uddokta_app;

CREATE FUNCTION current_user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Definer functions: policies on store_members cannot query store_members directly without recursing.
CREATE FUNCTION my_role(store uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT role FROM store_members WHERE store_id = store AND user_id = current_user_id() $$;

CREATE FUNCTION store_has_members(store uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT EXISTS (SELECT 1 FROM store_members WHERE store_id = store) $$;

CREATE FUNCTION shares_store(other uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_members mine JOIN store_members theirs USING (store_id)
    WHERE mine.user_id = current_user_id() AND theirs.user_id = other
  )
$$;

-- Owners manage everyone; admins manage everyone except owners.
CREATE FUNCTION can_manage(store uuid, target_role text) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(my_role(store) = 'owner' OR (my_role(store) = 'admin' AND target_role <> 'owner'), false) $$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_read ON users FOR SELECT TO uddokta_app
  USING (id = current_user_id() OR shares_store(id));

CREATE POLICY stores_read ON stores FOR SELECT TO uddokta_app USING (my_role(id) IS NOT NULL);
CREATE POLICY stores_create ON stores FOR INSERT TO uddokta_app WITH CHECK (current_user_id() IS NOT NULL);
CREATE POLICY stores_update ON stores FOR UPDATE TO uddokta_app USING (my_role(id) IN ('owner', 'admin'));

CREATE POLICY members_read ON store_members FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
CREATE POLICY members_add ON store_members FOR INSERT TO uddokta_app WITH CHECK (
  can_manage(store_id, role)
  OR (user_id = current_user_id() AND role = 'owner' AND NOT store_has_members(store_id))
);
CREATE POLICY members_change ON store_members FOR UPDATE TO uddokta_app
  USING (can_manage(store_id, role)) WITH CHECK (can_manage(store_id, role));
CREATE POLICY members_remove ON store_members FOR DELETE TO uddokta_app
  USING (user_id = current_user_id() OR can_manage(store_id, role));

CREATE POLICY invites_manage ON store_invites FOR ALL TO uddokta_app
  USING (can_manage(store_id, role)) WITH CHECK (can_manage(store_id, role));

-- A store always keeps an owner. Checked at commit, with the store row locked,
-- so a new store can add its owner in the same transaction and two owners
-- demoting each other at once cannot both succeed.
CREATE FUNCTION ensure_store_has_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  store uuid;
BEGIN
  IF TG_TABLE_NAME = 'stores' THEN store := NEW.id; ELSE store := OLD.store_id; END IF;
  PERFORM 1 FROM stores WHERE id = store FOR UPDATE;
  IF FOUND AND NOT EXISTS (SELECT 1 FROM store_members WHERE store_id = store AND role = 'owner') THEN
    RAISE EXCEPTION 'store % would have no owner', store USING ERRCODE = 'UD001';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER store_needs_owner AFTER INSERT ON stores
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_store_has_owner();
CREATE CONSTRAINT TRIGGER member_change_keeps_owner AFTER UPDATE OR DELETE ON store_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_store_has_owner();

-- Sign-up, login and sessions happen before a user is known, so they go through these functions only.
CREATE FUNCTION register_user(new_id uuid, new_email text, new_name text, hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO users (id, email, name) VALUES (new_id, new_email, new_name);
  INSERT INTO user_credentials (user_id, password_hash) VALUES (new_id, hash);
$$;

CREATE FUNCTION login_lookup(lookup_email text) RETURNS TABLE (user_id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, c.password_hash FROM users u JOIN user_credentials c ON c.user_id = u.id WHERE u.email = lookup_email
$$;

CREATE FUNCTION recent_login_failures(lookup_email text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer FROM login_failures WHERE email = lookup_email AND at > now() - interval '15 minutes'
$$;

CREATE FUNCTION record_login_failure(lookup_email text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO login_failures (email) VALUES (lookup_email);
$$;

CREATE FUNCTION clear_login_failures(lookup_email text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM login_failures WHERE email = lookup_email;
$$;

CREATE FUNCTION create_session(hash text, session_user_id uuid, expires timestamptz) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (hash, session_user_id, expires);
$$;

CREATE FUNCTION session_owner(hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT user_id FROM sessions WHERE token_hash = hash AND expires_at > now()
$$;

CREATE FUNCTION delete_session(hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM sessions WHERE token_hash = hash;
$$;

-- Invites are opened by people who are not members yet.
CREATE FUNCTION invite_preview(hash text) RETURNS TABLE (store_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.name, i.role FROM store_invites i JOIN stores s ON s.id = i.store_id
  WHERE i.token_hash = hash AND i.expires_at > now()
$$;

-- Single use. Someone already on the team keeps their current role.
CREATE FUNCTION accept_invite(hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  invite store_invites;
BEGIN
  DELETE FROM store_invites WHERE token_hash = hash AND expires_at > now() RETURNING * INTO invite;
  IF invite.id IS NULL OR current_user_id() IS NULL THEN RETURN NULL; END IF;
  INSERT INTO store_members (store_id, user_id, role) VALUES (invite.store_id, current_user_id(), invite.role)
    ON CONFLICT DO NOTHING;
  RETURN (SELECT handle FROM stores WHERE id = invite.store_id);
END $$;

REVOKE ALL ON FUNCTION my_role, store_has_members, shares_store, register_user, login_lookup, recent_login_failures,
  record_login_failure, clear_login_failures, create_session, session_owner, delete_session, invite_preview,
  accept_invite FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_role, store_has_members, shares_store, register_user, login_lookup, recent_login_failures,
  record_login_failure, clear_login_failures, create_session, session_owner, delete_session, invite_preview,
  accept_invite TO uddokta_app;
