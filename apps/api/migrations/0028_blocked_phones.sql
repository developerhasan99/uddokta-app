CREATE TABLE "blocked_phones" (
	"store_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_phones_store_id_phone_pk" PRIMARY KEY("store_id","phone"),
	CONSTRAINT "blocked_phones_lengths" CHECK (length("blocked_phones"."phone") between 1 and 20 and length("blocked_phones"."reason") <= 200)
);
--> statement-breakpoint
ALTER TABLE "blocked_phones" ADD CONSTRAINT "blocked_phones_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;