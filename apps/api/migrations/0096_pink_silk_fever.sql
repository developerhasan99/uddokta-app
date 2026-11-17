ALTER TABLE "account_tokens" DROP CONSTRAINT "account_tokens_purpose";--> statement-breakpoint
ALTER TABLE "account_tokens" ADD COLUMN "new_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "language" text DEFAULT 'bn' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_new_email" CHECK (("account_tokens"."purpose" = 'email') = ("account_tokens"."new_email" is not null));--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_purpose" CHECK ("account_tokens"."purpose" in ('reset', 'verify', 'email'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_language" CHECK ("users"."language" in ('bn', 'en'));--> statement-breakpoint
-- Profile changes go through these functions (the app role can only read users). The caller passes the signed-in
-- user from its session; password checks happen in the API before the ones that need them.
CREATE FUNCTION update_profile(account uuid, new_name text, new_language text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE users SET name = coalesce(new_name, name), language = coalesce(new_language, language) WHERE id = account
$$;--> statement-breakpoint
CREATE FUNCTION account_password_hash(account uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT password_hash FROM user_credentials WHERE user_id = account
$$;--> statement-breakpoint
CREATE FUNCTION account_session_count(account uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer FROM sessions WHERE user_id = account AND expires_at > now()
$$;--> statement-breakpoint
-- Signs out every other device. Pending email-change links go too, so a session that is being thrown out cannot
-- finish moving the account to another address.
CREATE FUNCTION end_other_sessions(account uuid, keep text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM sessions WHERE user_id = account AND token_hash <> keep;
  DELETE FROM account_tokens WHERE user_id = account AND purpose IN ('reset', 'email');
$$;--> statement-breakpoint
CREATE FUNCTION change_password(account uuid, new_hash text, keep text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE user_credentials SET password_hash = new_hash WHERE user_id = account;
  SELECT end_other_sessions(account, keep);
$$;--> statement-breakpoint
-- A link to the new address; the email changes only when it is used. False when the address has an account or three
-- links were sent in the last hour. An earlier unused link stops working.
CREATE FUNCTION start_email_change(account uuid, address text, token text, ttl interval) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE email = address) THEN RETURN 'emailTaken'; END IF;
  IF (SELECT count(*) FROM account_tokens t WHERE t.user_id = account AND t.purpose = 'email' AND t.created_at > now() - interval '1 hour') >= 3 THEN RETURN 'tooManyEmails'; END IF;
  DELETE FROM account_tokens WHERE user_id = account AND purpose = 'email';
  INSERT INTO account_tokens (token_hash, user_id, purpose, new_email, expires_at) VALUES (token, account, 'email', address, now() + ttl);
  RETURN 'sent';
END $$;--> statement-breakpoint
-- Uses the link once. Returns the old address (for a notice), the name and language, or nothing when the link is
-- unknown, used, expired or the address was taken meanwhile.
CREATE FUNCTION finish_email_change(token text) RETURNS TABLE (old_email text, new_email text, name text, language text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  used account_tokens;
  account users;
BEGIN
  DELETE FROM account_tokens WHERE token_hash = token AND purpose = 'email' RETURNING * INTO used;
  IF used.user_id IS NULL OR used.expires_at <= now() OR EXISTS (SELECT 1 FROM users WHERE email = used.new_email) THEN RETURN; END IF;
  SELECT * INTO account FROM users WHERE id = used.user_id;
  UPDATE users SET email = used.new_email, email_verified_at = now() WHERE id = used.user_id;
  DELETE FROM account_tokens WHERE user_id = used.user_id AND purpose IN ('reset', 'verify');
  DELETE FROM login_failures WHERE email IN (account.email, used.new_email);
  RETURN QUERY SELECT account.email, used.new_email, account.name, account.language;
END $$;--> statement-breakpoint
-- Deleting an account removes its memberships; a store left without an owner refuses it (UD001, checked at commit).
CREATE FUNCTION delete_account(account uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM users WHERE id = account
$$;--> statement-breakpoint
-- A password reset also cancels a pending email change (it may have come from whoever the reset locks out).
CREATE OR REPLACE FUNCTION finish_password_reset(token text, new_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  used account_tokens;
BEGIN
  DELETE FROM account_tokens WHERE token_hash = token AND purpose = 'reset' RETURNING * INTO used;
  IF used.user_id IS NULL OR used.expires_at <= now() THEN RETURN NULL; END IF;
  UPDATE user_credentials SET password_hash = new_hash WHERE user_id = used.user_id;
  DELETE FROM sessions WHERE user_id = used.user_id;
  DELETE FROM account_tokens WHERE user_id = used.user_id AND purpose IN ('reset', 'email');
  UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = used.user_id;
  DELETE FROM login_failures WHERE email = (SELECT email FROM users WHERE id = used.user_id);
  RETURN used.user_id;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION update_profile, account_password_hash, account_session_count, end_other_sessions, change_password, start_email_change, finish_email_change, delete_account FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION update_profile, account_password_hash, account_session_count, end_other_sessions, change_password, start_email_change, finish_email_change, delete_account TO uddokta_app;
