-- The support WhatsApp number (the console's Settings, shared with billing) for "contact support" links. Public on
-- purpose: the log-in page needs it before anyone signs in, and it returns nothing else from platform_settings.
CREATE FUNCTION support_contact() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('whatsapp', billing_whatsapp) FROM platform_settings WHERE id = 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION support_contact FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION support_contact TO uddokta_app;
