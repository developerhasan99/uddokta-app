CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"page_id" uuid,
	"theme_id" uuid,
	"label" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "versions_owner" CHECK (("versions"."page_id" is null) <> ("versions"."theme_id" is null)),
	CONSTRAINT "versions_label" CHECK ("versions"."label" in ('save', 'publish', 'restore'))
);
--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_page" FOREIGN KEY ("store_id","page_id") REFERENCES "public"."pages"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_theme" FOREIGN KEY ("store_id","theme_id") REFERENCES "public"."themes"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "versions_page" ON "versions" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "versions_theme" ON "versions" USING btree ("theme_id","created_at");--> statement-breakpoint
-- Members read the history of what they can open and write it through the API's saves; restoring checks the target's own rules.
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON versions TO uddokta_app;--> statement-breakpoint
CREATE POLICY versions_member ON versions FOR ALL TO uddokta_app USING (my_role(store_id) IS NOT NULL) WITH CHECK (my_role(store_id) IS NOT NULL);
