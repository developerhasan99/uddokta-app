-- Existing live pages retain their current metadata when the snapshot is introduced.
UPDATE pages SET published_meta = jsonb_build_object('title', title, 'handle', handle, 'seoTitle', seo_title, 'seoDescription', seo_description)
WHERE published IS NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION storefront_page(store_handle text, page_handle text)
RETURNS TABLE (store_id uuid, store_name text, delivery_inside integer, delivery_outside integer, theme text, page_id uuid, title text, seo_title text, seo_description text, content jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.name, s.delivery_inside, s.delivery_outside, s.theme, p.id,
    p.published_meta->>'title', p.published_meta->>'seoTitle', p.published_meta->>'seoDescription', p.published
  FROM pages p JOIN stores s ON s.id = p.store_id
  WHERE s.handle = store_handle AND p.published_meta->>'handle' = page_handle AND p.published IS NOT NULL
$$;
--> statement-breakpoint
ALTER TABLE checkout_receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON checkout_receipts TO uddokta_app;
--> statement-breakpoint
CREATE POLICY checkout_receipts_read ON checkout_receipts FOR SELECT TO uddokta_app USING (my_role(store_id) IS NOT NULL);
--> statement-breakpoint
-- The receipt token serializes retries before pricing, coupon use, stock changes, or order creation.
-- A different payload cannot reuse a token that has already placed an order.
CREATE FUNCTION place_checkout(receipt_token uuid, store uuid, page uuid, variant uuid, qty integer, buyer_name text, buyer_phone text, buyer_address text, buyer_area text,
  order_source text, coupon text DEFAULT '')
RETURNS TABLE (number integer, total integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  existing checkout_receipts%ROWTYPE;
  request_fingerprint text;
  placed record;
BEGIN
  IF receipt_token IS NULL OR order_source NOT IN ('landing_page', 'website') THEN
    RAISE EXCEPTION 'invalid checkout' USING ERRCODE = 'UD017';
  END IF;
  request_fingerprint := md5(jsonb_build_array(page, variant, qty, buyer_name, buyer_phone, buyer_address, buyer_area, order_source, coalesce(coupon, ''))::text);
  PERFORM pg_advisory_xact_lock(hashtext('checkout:' || store), hashtext(receipt_token::text));
  SELECT * INTO existing FROM checkout_receipts r WHERE r.store_id = store AND r.token = receipt_token;
  IF FOUND THEN
    IF existing.fingerprint <> request_fingerprint THEN
      RAISE EXCEPTION 'checkout already used' USING ERRCODE = 'UD017';
    END IF;
    RETURN QUERY SELECT existing.number, existing.total;
    RETURN;
  END IF;
  SELECT * INTO placed FROM place_order(store, page, variant, qty, buyer_name, buyer_phone, buyer_address, buyer_area, order_source, coupon);
  INSERT INTO checkout_receipts (store_id, token, fingerprint, number, total)
    VALUES (store, receipt_token, request_fingerprint, placed.number, placed.total);
  RETURN QUERY SELECT placed.number::integer, placed.total::integer;
END $$;
--> statement-breakpoint
-- No buyer details can be read through an opaque receipt, even without a signed-in user.
CREATE FUNCTION storefront_receipt(store uuid, receipt_token uuid)
RETURNS TABLE (number integer, total integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.number, r.total FROM checkout_receipts r WHERE r.store_id = store AND r.token = receipt_token
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION place_checkout, storefront_receipt FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION place_checkout, storefront_receipt TO uddokta_app;
