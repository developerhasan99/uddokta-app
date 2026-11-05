# Landing-page editor: preimplementation persistence audit

Baseline inspected on 5 November 2026, before the section/settings implementation. For the current implementation, see [BUILDER-IMPLEMENTATION.md](BUILDER-IMPLEMENTATION.md). The findings below describe the original starting point.

## Existing save path

1. `apps/dashboard/src/pages/Pages.tsx` creates a page by POSTing its title to `/api/stores/:handle/pages`. The API generates seven default sections through `starterContent()` and inserts a new draft. There is no template identifier in the current creation flow.
2. `apps/dashboard/src/pages/PageEditor.tsx` GETs `/api/stores/:handle/pages/:id`. The returned `draft` becomes the React `doc.content` object. Title, handle and SEO fields are held alongside it. `baseline` stores a serialized copy for unsaved-change detection.
3. Editing fields, adding, duplicating, hiding, removing and moving sections changes React state. Array order is display order. Undo/redo keeps up to 100 in-memory snapshots. There is no editor autosave, localStorage recovery, IndexedDB recovery, or persistent undo history. Save, Ctrl/Cmd+S, and the leave-dialog Save action invoke the explicit save routine.
4. Save sends the **whole document**, not a patch, through `PUT /api/stores/:handle/pages/:id`:

```json
{
  "title": "My page",
  "handle": "my-page",
  "seoTitle": "",
  "seoDescription": "",
  "draft": {
    "version": 1,
    "sections": [
      {
        "id": "a1b2c3d4",
        "type": "hero",
        "hidden": false,
        "settings": {
          "heading": "My product",
          "text": "A short description",
          "image": null,
          "button": "Order now"
        }
      }
    ]
  },
  "revision": 3
}
```

The request helper JSON-stringifies the body and sets `Content-Type: application/json`. The example revision is illustrative; a real save uses the revision returned when the page was last loaded or saved.

5. `apps/api/src/pages.ts` validates the payload using `readContent()` from `apps/storefront/src/schema.ts`, checks referenced images/products belong to the store, reserves a unique handle, then updates the row only if its revision matches. A successful save increments revision and returns the saved draft. A stale save receives HTTP 409 `pageChanged`.
6. The table in `apps/api/src/schema.ts` stores the document in PostgreSQL `pages.draft` (`jsonb`). `title`, `handle`, `seo_title`, and `seo_description` are separate columns. `pages.published` is a separate nullable `jsonb` document; `published_meta` is a separate JSON metadata snapshot. Each row belongs to one store.
7. Publish first saves unsaved browser changes, then POSTs `{ revision }` to `/api/stores/:handle/pages/:id/publish`. The API copies the saved draft into `published`, snapshots public metadata, records publication time and increments revision. Save alone does not change the published document.
8. The `storefront_page()` function in migration `0049_publish_checkout_security.sql` exposes the published document and metadata only. The storefront loads its media/product references and server-renders it through the same `PageView` and section components used by the editor preview. HTML is produced by rendering; it is not the saved page format.

## What is and is not in the JSON

| Information | Current location |
| --- | --- |
| Ordered page sections | `draft.sections` / `published.sections` arrays |
| Section identity and visibility | Each section's `id`, `type`, `hidden` |
| Text, list items, image/product IDs, video URLs, deadlines | Schema-declared section `settings` |
| Title, handle, SEO | Separate draft columns, then `published_meta` snapshot |
| Image binaries | Media storage; JSON contains owned media UUIDs, not embedded files or arbitrary image URLs |
| Product prices, stock, variants | Product data loaded through the section's product ID; not a static HTML price |
| Store color/font/corner preset | `stores.theme`, loaded independently from the page document |
| Header and footer | Hard-coded in `PageView`; absent from page JSON |
| Template choice | Not currently stored or accepted during creation |
| Per-section style, responsive settings, layout variants | Not currently supported as general schema fields |
| Selected editor panel, mobile preview, undo history | Browser memory only |

Store-level theme and store name are read independently of the published document, so publication freezes content and metadata, not every aspect of the page's appearance. Product data also remains independently managed.

## Validation behavior confirmed directly

Ran the current `readContent()` function against a hero with an extra `backgroundColor` setting, a section-level `style` object and a top-level `canvas` object. All three additions were discarded. The returned section retained only `id`, `type`, `hidden`, and declared settings. A version-1 document with zero sections was accepted.

The validator currently accepts version 1 only, up to 40 sections, recognized section types, distinct valid section IDs, bounded strings/lists and valid owned-reference shapes. The API also caps the validated document's serialized length at 200,000 characters (the variable is named `maxContentBytes`, but the check uses JavaScript string length).

## Consequences for the new builder

Keep the existing JSON persistence model and shared renderers. The foundation is suitable; it does not require storing rendered HTML or introducing Shopify Liquid.

- Use the five separate HTML designs as references and map each design to reusable section types, variants and schema-declared content/style controls.
- Add validated layout, typography, surface, button and responsive settings to the shared schema. Update validation, generated settings UI and renderers together so saved controls survive a reload.
- Add optional header/footer sections or explicit canvas behavior, preserving older published pages. Zero sections already validates, but the current public renderer still draws header and footer.
- Seed a selected template into a new draft with fresh section IDs. Keep product/media references scoped to the seller; template sample photos are not another seller's media records.
- If the document shape changes, introduce a compatible version/migration and update the storefront loader as well as editor/API. The public loader currently trusts database content rather than calling `readContent()` on every request.
- Preserve draft/publish isolation, revision checks, reference validation and media-usage protection. Consider autosave/recovery as a separate explicit feature rather than assuming it already exists.

The general concept matches Shopify JSON templates (section configuration and settings separate from rendering), but our exact JSON shape, PostgreSQL storage and React renderers are our own implementation.
