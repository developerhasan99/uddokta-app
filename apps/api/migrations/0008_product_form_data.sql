-- Deferred to commit: a save replaces a product's images after its variants, and deleting a product removes both in an undefined order.
ALTER TABLE product_variants ADD CONSTRAINT product_variants_media_fk FOREIGN KEY (product_id, media_id) REFERENCES product_media (product_id, media_id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Descriptions become HTML: keep what older plain-text ones say and where their lines break.
UPDATE products SET description = '<p>' || replace(replace(replace(description, '&', '&amp;'), '<', '&lt;'), E'\n', '<br>') || '</p>' WHERE description <> '';
