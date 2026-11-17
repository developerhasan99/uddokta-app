CREATE TABLE "account_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_tokens_purpose" CHECK ("account_tokens"."purpose" in ('reset', 'verify'))
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_reason" CHECK ("email_suppressions"."reason" in ('bounce', 'complaint'))
);
--> statement-breakpoint
CREATE TABLE "outbox_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"text_body" text,
	"html_body" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "outbox_emails_status" CHECK ("outbox_emails"."status" in ('queued', 'sent', 'failed', 'suppressed'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_tokens_user" ON "account_tokens" USING btree ("user_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "outbox_emails_due" ON "outbox_emails" USING btree ("status","next_attempt_at");--> statement-breakpoint
-- Email links, the outbox and suppressions are never read by the app role directly: only through these functions.
ALTER TABLE account_tokens ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE outbox_emails ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON account_tokens, outbox_emails, email_suppressions FROM PUBLIC;--> statement-breakpoint
-- Starts a password reset for this email, if it has an account and fewer than 3 resets were asked for in the last hour.
-- Returns the account's name when a link should be sent, nothing otherwise (the caller answers the same either way).
CREATE FUNCTION start_password_reset(lookup_email text, token text, ttl interval) RETURNS TABLE (name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  account users;
BEGIN
  SELECT * INTO account FROM users WHERE email = lookup_email;
  IF account.id IS NULL THEN RETURN; END IF;
  DELETE FROM account_tokens WHERE expires_at < now() - interval '1 day';
  IF (SELECT count(*) FROM account_tokens t WHERE t.user_id = account.id AND t.purpose = 'reset' AND t.created_at > now() - interval '1 hour') >= 3 THEN RETURN; END IF;
  INSERT INTO account_tokens (token_hash, user_id, purpose, expires_at) VALUES (token, account.id, 'reset', now() + ttl);
  RETURN QUERY SELECT account.name;
END $$;--> statement-breakpoint
-- Uses a reset link once: sets the new password, ends every session and other reset links, and counts as proof
-- that the owner reads this inbox. Returns the user, or null when the link is unknown, used or expired.
CREATE FUNCTION finish_password_reset(token text, new_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  used account_tokens;
BEGIN
  DELETE FROM account_tokens WHERE token_hash = token AND purpose = 'reset' RETURNING * INTO used;
  IF used.user_id IS NULL OR used.expires_at <= now() THEN RETURN NULL; END IF;
  UPDATE user_credentials SET password_hash = new_hash WHERE user_id = used.user_id;
  DELETE FROM sessions WHERE user_id = used.user_id;
  DELETE FROM account_tokens WHERE user_id = used.user_id AND purpose = 'reset';
  UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = used.user_id;
  DELETE FROM login_failures WHERE email = (SELECT email FROM users WHERE id = used.user_id);
  RETURN used.user_id;
END $$;--> statement-breakpoint
-- A verification link for a signed-in user whose email is not verified yet, at most 3 an hour.
CREATE FUNCTION start_email_verification(account uuid, token text, ttl interval) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = account AND email_verified_at IS NULL) THEN RETURN false; END IF;
  IF (SELECT count(*) FROM account_tokens t WHERE t.user_id = account AND t.purpose = 'verify' AND t.created_at > now() - interval '1 hour') >= 3 THEN RETURN false; END IF;
  INSERT INTO account_tokens (token_hash, user_id, purpose, expires_at) VALUES (token, account, 'verify', now() + ttl);
  RETURN true;
END $$;--> statement-breakpoint
CREATE FUNCTION finish_email_verification(token text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  used account_tokens;
BEGIN
  DELETE FROM account_tokens WHERE token_hash = token AND purpose = 'verify' RETURNING * INTO used;
  IF used.user_id IS NULL OR used.expires_at <= now() THEN RETURN NULL; END IF;
  UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = used.user_id;
  DELETE FROM account_tokens WHERE user_id = used.user_id AND purpose = 'verify';
  RETURN used.user_id;
END $$;--> statement-breakpoint
-- Queues an email. A suppressed address is recorded as such and gets nothing (returns false).
CREATE FUNCTION queue_email(recipient text, email_kind text, email_subject text, body_text text, body_html text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM email_suppressions WHERE email = lower(recipient)) THEN
    INSERT INTO outbox_emails (to_email, kind, subject, status) VALUES (lower(recipient), email_kind, email_subject, 'suppressed');
    RETURN false;
  END IF;
  INSERT INTO outbox_emails (to_email, kind, subject, text_body, html_body) VALUES (lower(recipient), email_kind, email_subject, body_text, body_html);
  RETURN true;
END $$;--> statement-breakpoint
-- Takes up to max_count due emails for one sending attempt (other API instances skip them). Each attempt pushes
-- the next one back (1, 2, 4, 8 minutes). Emails still unsent after an hour are dropped: their links are expired.
CREATE FUNCTION claim_emails(max_count integer) RETURNS TABLE (id uuid, to_email text, subject text, text_body text, html_body text, attempts integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE outbox_emails o SET status = 'failed', text_body = NULL, html_body = NULL, last_error = coalesce(o.last_error, 'expired')
  WHERE o.status = 'queued' AND o.created_at < now() - interval '1 hour';
  RETURN QUERY UPDATE outbox_emails o SET attempts = o.attempts + 1, next_attempt_at = now() + interval '1 minute' * power(2, o.attempts)
  WHERE o.id IN (SELECT q.id FROM outbox_emails q WHERE q.status = 'queued' AND q.next_attempt_at <= now() ORDER BY q.created_at LIMIT max_count FOR UPDATE SKIP LOCKED)
  RETURNING o.id, o.to_email, o.subject, o.text_body, o.html_body, o.attempts;
END $$;--> statement-breakpoint
-- After an attempt: sent clears the body; a failure stays queued for another try unless it was the last (5) or final.
CREATE FUNCTION finish_email(email_id uuid, sent boolean, error text, final boolean) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE outbox_emails SET
    status = CASE WHEN sent THEN 'sent' WHEN final OR attempts >= 5 THEN 'failed' ELSE 'queued' END,
    sent_at = CASE WHEN sent THEN now() END,
    last_error = CASE WHEN sent THEN NULL ELSE left(error, 500) END,
    text_body = CASE WHEN sent OR final OR attempts >= 5 THEN NULL ELSE text_body END,
    html_body = CASE WHEN sent OR final OR attempts >= 5 THEN NULL ELSE html_body END
  WHERE id = email_id
$$;--> statement-breakpoint
CREATE FUNCTION suppress_email(address text, why text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO email_suppressions (email, reason) VALUES (lower(address), why) ON CONFLICT (email) DO NOTHING
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION start_password_reset, finish_password_reset, start_email_verification, finish_email_verification, queue_email, claim_emails, finish_email, suppress_email FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION start_password_reset, finish_password_reset, start_email_verification, finish_email_verification, queue_email, claim_emails, finish_email, suppress_email TO uddokta_app;
