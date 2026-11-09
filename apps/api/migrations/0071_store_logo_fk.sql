-- The store logo is one of the store's own gallery images. Deferred like the other media links, so a logo in use
-- cannot be deleted (answered as mediaInUse) and an image from another store can never be set.
ALTER TABLE stores ADD CONSTRAINT stores_logo_fk FOREIGN KEY (id, logo_media_id) REFERENCES media (store_id, id) DEFERRABLE INITIALLY DEFERRED;
