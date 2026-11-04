CREATE TABLE "customer_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"outcome" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_calls_outcome" CHECK ("customer_calls"."outcome" in ('ordered', 'later', 'no_answer', 'not_interested')),
	CONSTRAINT "customer_calls_note" CHECK (length("customer_calls"."note") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "customer_calls" ADD CONSTRAINT "customer_calls_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_calls" ADD CONSTRAINT "customer_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_calls_store_phone" ON "customer_calls" USING btree ("store_id","phone","created_at");