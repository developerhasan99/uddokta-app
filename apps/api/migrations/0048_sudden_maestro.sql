CREATE TABLE "checkout_receipts" (
	"store_id" uuid NOT NULL,
	"token" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"number" integer NOT NULL,
	"total" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_receipts_store_id_token_pk" PRIMARY KEY("store_id","token")
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "published_meta" jsonb;--> statement-breakpoint
ALTER TABLE "checkout_receipts" ADD CONSTRAINT "checkout_receipts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;