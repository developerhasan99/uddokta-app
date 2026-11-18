-- Paid plans made before this rule get the own domain first, so the check below always holds.
UPDATE plans SET features = array_append(features, 'customDomain') WHERE price_bdt > 0 AND NOT ('customDomain' = ANY (features));--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_paid_domain" CHECK ("plans"."price_bdt" = 0 or 'customDomain' = any("plans"."features"));