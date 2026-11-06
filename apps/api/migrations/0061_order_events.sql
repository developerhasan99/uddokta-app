CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid,
	"user_name" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_events_kind" CHECK ("order_events"."kind" in ('placed', 'status', 'edited', 'contact', 'note', 'tags', 'shipped', 'comment')),
	CONSTRAINT "order_events_comment" CHECK ("order_events"."kind" <> 'comment' or length("order_events"."data"->>'text') between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");