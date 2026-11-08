CREATE TABLE "notification_settings" (
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "notification_settings_store_id_user_id_kind_pk" PRIMARY KEY("store_id","user_id","kind"),
	CONSTRAINT "notification_settings_kind" CHECK ("notification_settings"."kind" in ('order_new', 'checkout_draft', 'order_delivered', 'order_returned', 'low_stock', 'member_joined'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_kind" CHECK ("notifications"."kind" in ('order_new', 'checkout_draft', 'order_delivered', 'order_returned', 'low_stock', 'member_joined'))
);
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_store_created" ON "notifications" USING btree ("user_id","store_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_store_created" ON "notifications" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread" ON "notifications" USING btree ("user_id","store_id") WHERE "notifications"."read_at" is null;