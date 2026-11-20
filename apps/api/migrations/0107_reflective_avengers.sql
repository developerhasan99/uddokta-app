CREATE TABLE "phone_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "phone_codes" ADD CONSTRAINT "phone_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phone_codes_user" ON "phone_codes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "phone_codes_phone" ON "phone_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_verified_phone" ON "users" USING btree ("phone") WHERE "users"."phone_verified_at" is not null;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone" CHECK ("users"."phone" ~ '^01[3-9][0-9]{8}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_verified" CHECK ("users"."phone_verified_at" is null or "users"."phone" is not null);--> statement-breakpoint
-- Phone codes are never read by the app role directly: only through these functions (a test proves it).
ALTER TABLE phone_codes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON phone_codes FROM PUBLIC;--> statement-breakpoint
-- Records the account's number (any time until it is verified) and keeps a code for it, within limits: one code a
-- minute and 3 an hour per account, 5 a day per number, so the form cannot be used to flood someone's phone.
-- Returns 'ok' (send the code), 'verified', 'phoneTaken' (another account verified this number), 'wait' or 'tooMany'.
CREATE FUNCTION start_phone_verification(account uuid, new_phone text, code text, ttl interval) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current users;
BEGIN
  SELECT * INTO current FROM users WHERE id = account FOR UPDATE;
  IF current.phone_verified_at IS NOT NULL THEN RETURN 'verified'; END IF;
  IF EXISTS (SELECT 1 FROM users WHERE phone = new_phone AND phone_verified_at IS NOT NULL) THEN RETURN 'phoneTaken'; END IF;
  UPDATE users SET phone = new_phone WHERE id = account;
  DELETE FROM phone_codes WHERE created_at < now() - interval '1 day';
  IF EXISTS (SELECT 1 FROM phone_codes c WHERE c.user_id = account AND c.created_at > now() - interval '1 minute') THEN RETURN 'wait'; END IF;
  IF (SELECT count(*) FROM phone_codes c WHERE c.user_id = account AND c.created_at > now() - interval '1 hour') >= 3
    OR (SELECT count(*) FROM phone_codes c WHERE c.phone = new_phone AND c.created_at > now() - interval '1 day') >= 5 THEN RETURN 'tooMany'; END IF;
  INSERT INTO phone_codes (user_id, phone, code_hash, expires_at) VALUES (account, new_phone, code, now() + ttl);
  RETURN 'ok';
END $$;--> statement-breakpoint
-- Checks a code against the latest one sent to the account's current number; five wrong tries use it up.
-- Returns 'ok' (verified), 'wrong', 'expired' (none, too old or used up) or 'phoneTaken'.
CREATE FUNCTION finish_phone_verification(account uuid, code text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  latest phone_codes;
BEGIN
  SELECT c.* INTO latest FROM phone_codes c JOIN users u ON u.id = c.user_id AND u.phone = c.phone
  WHERE c.user_id = account ORDER BY c.created_at DESC LIMIT 1 FOR UPDATE OF c;
  IF latest.id IS NULL OR latest.expires_at <= now() OR latest.attempts >= 5 THEN RETURN 'expired'; END IF;
  IF latest.code_hash <> code THEN
    UPDATE phone_codes SET attempts = attempts + 1 WHERE id = latest.id;
    RETURN 'wrong';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE phone = latest.phone AND phone_verified_at IS NOT NULL AND id <> account) THEN RETURN 'phoneTaken'; END IF;
  UPDATE users SET phone_verified_at = now() WHERE id = account;
  DELETE FROM phone_codes WHERE user_id = account;
  RETURN 'ok';
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION start_phone_verification, finish_phone_verification FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION start_phone_verification, finish_phone_verification TO uddokta_app;
--> statement-breakpoint
-- The console shows each account's phone and whether it is verified, and finds accounts by number.
DROP FUNCTION console_users(uuid, text, integer, integer);--> statement-breakpoint
CREATE FUNCTION console_users(admin uuid, search text, lim integer, off integer)
RETURNS TABLE (id uuid, name text, email text, verified boolean, phone text, phone_verified boolean, suspended_at timestamptz, created_at timestamptz, stores integer, is_admin boolean, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN QUERY SELECT u.id, u.name, u.email, u.email_verified_at IS NOT NULL, u.phone, u.phone_verified_at IS NOT NULL, u.suspended_at, u.created_at,
    (SELECT count(*)::integer FROM store_members m WHERE m.user_id = u.id), EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id = u.id), count(*) OVER ()
  FROM users u
  WHERE search = '' OR u.email ILIKE '%' || search || '%' OR u.name ILIKE '%' || search || '%' OR u.phone LIKE '%' || search || '%'
  ORDER BY u.created_at DESC LIMIT least(lim, 100) OFFSET off;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION console_user(admin uuid, account uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM console_check(admin);
  RETURN (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'language', u.language, 'verified', u.email_verified_at IS NOT NULL,
    'phone', u.phone, 'phoneVerified', u.phone_verified_at IS NOT NULL,
    'suspendedAt', u.suspended_at, 'createdAt', u.created_at, 'isAdmin', EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id = u.id),
    'sessions', (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()),
    'stores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'role', m.role) ORDER BY s.name), '[]') FROM store_members m JOIN stores s ON s.id = m.store_id WHERE m.user_id = u.id))
  FROM users u WHERE u.id = account);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION console_users FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION console_users TO uddokta_app;
