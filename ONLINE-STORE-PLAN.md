# Online store plan: Themes, Menus, Pages

Status: in progress (started November 15, 2026). The owner said to build every phase in order; the **Confirm** items were taken at their recommended defaults: Phase 7 (cart) is in, Preferences goes under Online store, and theme imports accept only signed files.

| Phase | State |
|---|---|
| 1 Menus | Done (November 15, 2026) |
| 2 Store pages and policies | Done (November 15, 2026) |
| 3 Builder extraction | Folded into Phase 5: separating the editor only pays off when the theme editor exists, so it is done there against a real second user instead of a guessed interface |
| 4 Themes core | Done (November 15, 2026) |
| 5 Theme editor | Done (November 15, 2026) |
| 6 Theme library and history | Done (November 15, 2026) |
| 7–8 | Not started |

## Goal

Online store should feel complete to a seller coming from Shopify: several themes, one live, edited in a visual editor and published when ready; menus with nested links that never break; and proper store pages and policies. It uses the same builder engine as Landing pages: same sections, elements, blocks, settings schemas and preview. There is no second editor and no template language.

## What exists today

| Area | Today | Gap |
|---|---|---|
| Themes | 6 style presets in `apps/storefront/src/themes.ts` (colours, one font, corner radius) saved in `stores.theme`. | No layout control, no theme library, no editor, no versions. |
| Storefront | Fixed layout in `catalog.tsx`: home (all-products grid), collection, product page with a one-product COD form, landing pages at `/:handle`. | Nothing is editable. No cart, search, all-collections page, 404 page or policy pages. |
| Menus | One flat list of up to 12 links in `stores.menu` jsonb, edited in `Menus.tsx`. Links are stored as hrefs. | Only one menu, no nesting, no footer menu. Renaming a collection or page breaks its link. |
| Pages | "Coming soon". | No About, Contact or policy pages. |
| Builder | `PageEditor.tsx` (1,450 lines) talks to `/stores/:h/pages/:id` directly. Sections, nodes and `readContent` are in `apps/storefront/src/schema.ts`; the `header` and `footer` blocks exist; the page canvas header and footer are a plain bar. | The editor is tied to landing pages. Blocks know nothing about "the current product" or "the current collection". |

## Decisions

1. **Themes are data, not code.** A theme is a JSON document built from our sections, elements and blocks. We do not accept uploaded Liquid, React or JavaScript themes. CLAUDE.md already rules out a Liquid-style language. Code themes would also run seller-supplied scripts beside checkout and would break the "money is calculated by the system" rule. Sellers who need code still have Custom CSS and Custom HTML blocks.
2. **"Upload a theme" means import a theme file.** It works like landing-page export/import: a signed file with the theme JSON and its images' storage details, and images are copied in through `saveImage`. **Confirm:** only signed, unchanged files import (same as pages). Third-party theme authors and a theme store come later, if ever.
3. **Themes have draft and published copies, like pages.** Editing the live theme saves a draft, and Publish makes it live. Editing a theme that isn't live never touches the store. Making another theme live is a separate, explicit action.
4. **Version history is one mechanism for themes and pages.** It is the page version history already agreed in DEPLOYMENT-PLAN.md, built once and used by both.
5. **Store pages are rich-text pages shown inside the theme's page template.** Sellers who want a designed page use a landing page, and menus can link to either. This matches Shopify and avoids two builders for pages.
6. **Store pages and landing pages share the `/:handle` URL space** and the existing store-scoped handle reservation, so a handle can never mean two things.
7. **Cart and multi-product checkout are needed for a real online store.** `place_order_lines` already prices several lines. Without a cart, the Cart template and "Add to cart" have nothing to do. **Confirm:** include Phase 7. It also moves the focus from "landing-page COD selling" (CLAUDE.md) to the online store.
8. **Navigation:** Online store gets **Themes, Pages, Menus, Preferences**. **Confirm** adding Preferences (home SEO, share image, password page); otherwise those settings go in Themes › Theme settings.

## Data model

All tables have `store_id`, row-level security and an isolation test proving another store cannot reach them.

| Table | Columns | Notes |
|---|---|---|
| `themes` | id, store_id, name, draft jsonb, published jsonb null, revision, starter (id + version it came from), created_at, updated_at, published_at | Up to 10 themes per store, enforced under the store lock. |
| `stores.live_theme_id` | deferred FK to `themes(store_id, id)` | A store always has a live theme once migrated (deferred trigger, like owners). The live theme cannot be deleted. |
| `theme_media` | store_id, theme_id, media_id, draft/published | Same as `page_media`: blocks deleting images a theme uses. |
| `menus` | id, store_id, handle, title, items jsonb, revision | Items form a tree: title, link `{ type, id?, url? }`, children. At most 3 levels and 150 items. `main-menu` and `footer` are created with the store and cannot be deleted (handles locked). |
| `store_pages` | id, store_id, title, handle, body (rich text via `cleanRichText`), template, visibility (visible / hidden / scheduled + publish_at), seo_title, seo_description, policy null or one of refund, privacy, shipping, terms, contact | One page per policy kind (unique partial index). |
| `versions` | id, store_id, doc_kind (page / theme), doc_id, revision, content jsonb, label (save / publish / restore / import), created_at, created_by | Saves within 10 minutes are combined into one version. Keep the last 20 saves and published versions for 30 days, pruned by a pg-boss job. |

Menu links point to **ids**, not hrefs: home, all products, all collections, collection, product, store page, landing page, policy, search, cart, phone (`tel:`), WhatsApp, and web address (https only, checked with `safeHref`). Links are resolved when the page is drawn, so renames never break them. A link whose target was deleted is hidden on the storefront and flagged "Broken link" in Menus.

## Theme document

```
{ version: 1,
  settings: { colorSchemes[], typography { bangla, latin, scale }, buttons, inputs, radius, cards, layout { width, gutters }, social, favicon? },
  groups: { header: Section[], footer: Section[], announcement?: Section[] },
  templates: { home, product, collection, collections, page, search, cart, notFound, password,
               'product.<name>', 'collection.<name>', 'page.<name>' },   // alternates, at most 10 per type
  css }
```

- Each template is the existing `Content` v2 (sections, layout nodes, blocks), validated by `readContent`. A new `readTheme` checks the whole document: known template keys, size cap (1 MB), the same `<` refusal for `css`, and `maxNodes` per template.
- Theme settings become CSS variables (`--sf-*`, extending `presetCss`). Colour schemes are named sets that any section can choose ("Scheme 2"), so the six current presets become **style variations** of the starter theme rather than separate themes.
- Products, collections and store pages get an optional `template` field (an alternate name; blank = default). It is checked against the live theme when drawn and falls back to the default.

## Same builder engine

1. **Extract the editor (no visible change).** Split `PageEditor.tsx` into a `BuilderEditor` that knows nothing about where the document lives, plus a small adapter that supplies load, save, publish, restore, the blocks on offer and the preview context. Landing pages become the first adapter, and every current landing-page behaviour must still pass in the browser.
2. **Context blocks.** These blocks read "what this page is about" from the render `ctx`; no template language is involved. They are server-rendered like every block and validated by the same schemas.
   - Product: gallery, title, price, variant picker, quantity, buy buttons (Add to cart / Order now, which is the existing order form for that product), description, specifications, recommendations
   - Collection: banner, product grid (sort, columns, pagination), filters (price, in stock; later)
   - Listing: all collections list, search results, cart items and summary, page content (store page body)
   - Anywhere: featured product, featured collection, collection list, menu (picks a menu; desktop row or dropdown, phone drawer), logo, search box, cart icon, breadcrumbs
3. **Where blocks may go.** A context block is offered only in templates that have that context: Product blocks appear only in product templates. `readTheme` enforces this. In a landing page, blocks that need a context must be given a fixed product or collection, as the order form already is.
4. **Theme editor** (`/store/:handle/online-store/themes/:id/editor`) is the same dark editor with three additions:
   - A **template switcher** in the top bar (Home, Product, Collection, …, plus alternates and "Create template").
   - A **preview resource picker** ("Previewing: <product>"), which uses real store products and collections. If the store has none, it uses clearly labelled sample data.
   - A **Theme settings** sidebar tab generated from the settings schema. The header, announcement and footer groups are listed above and below every template's sections, as on Shopify.
5. **Landing pages pick up the theme.** "Show store header/footer" draws the live theme's header and footer groups instead of the plain bar, and pages use the theme's colours and fonts unless their own Page settings override them.

## Dashboard screens

**Themes** (`/online-store/themes`)
- A live theme card at the top: preview image, name, "Last saved", "Unpublished changes" badge, and Customize, View store and a `…` menu (Rename, Duplicate, Download theme file, Version history).
- Below it, the theme library: each card has Customize, Preview (opens the storefront through a signed preview link that expires after 24 hours, shown as a bar in the preview), Publish (confirm dialog explaining what changes), and `…` (Rename, Duplicate, Download, Delete).
- **Add theme:** start from a starter theme (with its style variations) or upload a theme file.
- **Version history** dialog: a list of saves and publishes with the person and time. Restore copies a version into the draft; images that are now missing are left blank, as on import.
- Staff can view; owners and admins edit, publish and delete.

**Menus** (`/online-store/menus`)
- A list: title, handle, item count, and a "Broken link" badge when one applies.
- The editor:
  - a drag tree (drag to reorder; drag right to nest; keyboard arrows as in the builder's list rows)
  - each item is a row with title and link picker (search across all link types)
  - edit, duplicate and delete
  - Save with a `revision` check (409 on conflict, as for pages)
- Staff can edit; owners and admins delete.

**Pages** (`/online-store/pages`)
- A data table: title, visibility, template, updated. Bulk show/hide/delete uses `Selection.tsx`.
- The editor: title, rich-text body, visibility (visible / hidden / visible from a date), template (alternates from the live theme), SEO with search preview, and handle (kept on rename, Bangla allowed).
- **Policies** (refund, privacy, shipping, terms, contact): created on demand from our own plain Bangla drafts, which the seller must review. The footer and the order form can link to them automatically.
- **Contact page template:** shows Settings › Store contact details and a WhatsApp button. A contact form waits for Inbox.
- Staff can add and edit; owners and admins delete.

**Preferences** (`/online-store/preferences`, if confirmed)
- Home page title and description, and a social share image.
- Password protection: a "coming soon" page with a seller-set password. Buyers get a cookie after entering it; landing pages stay open so ads keep working.
- `noindex` while protected.

## Storefront

- **Routes:**
  - `/`, `/products/:h`, `/collections/:h` and `/:handle`, as today, now drawn through the live theme
  - `/collections` (all collections), `/products` (all active products) and `/search?q=` (Postgres; Bangla is tested first, and Typesense only if this measurably fails)
  - `/cart` (Phase 7) and a themed 404 page
  - `/policies/:kind` redirects to the policy's page handle
- **Rendering:** each request uses the live theme's `published` copy only (via a new `storefront_theme` function, like `storefront_page`). A valid preview token renders a library theme's draft instead, uncached and `noindex`.
- **Cache purge:** publishing a theme, saving a menu, or saving, showing or hiding a store page purges the store's storefront cache (the hook `pages.ts` already uses).
- **Statuses:** product statuses (active / unlisted / draft) and collection rules apply unchanged inside every block.

## Migrating existing stores

One idempotent data step in `migrate.ts`, in the style of `retireOldBlocks`:
- Create the starter theme for each store, using the style variation that matches `stores.theme`, and set `live_theme_id`.
- Turn `stores.menu` into the `main-menu` menu. Known hrefs become id links and others become web-address links. Create an empty `footer` menu.
- Draw today's fixed layout as the starter theme's default templates, so every store looks the same the day after the migration.
- Drop `stores.theme`, `stores.menu`, `StoreLayout` and the fixed catalog pages only after the browser check passes on migrated data.

## Phases

Each phase ends with tests (`npm test`), `npm run build`, a browser check of the affected screens on desktop and phone, an entry in DEPLOYMENT-PLAN.md, and a commit. Update `permissions.ts` in the same change as any role rule.

| # | Phase | Delivers | Depends on |
|---|---|---|---|
| 1 | Menus | `menus` table, id links, nested drag tree, main and footer menus, migration from `stores.menu`, broken-link flags; storefront header renders the main menu with dropdowns and a phone drawer | none |
| 2 | Store pages and policies | `store_pages`, Pages list and editor, visibility and schedule, policy drafts, shared handle reservation, `/policies/:kind` | 1 (menu links to pages) |
| 3 | Builder extraction | `BuilderEditor` + landing-page adapter; render `ctx` carries product, collection, page and search; no visible change | none |
| 4 | Themes core | `themes`, `theme_media`, `live_theme_id`, `readTheme`, starter theme with style variations, context blocks, storefront renders through the theme, migration of every store | 1, 3 |
| 5 | Theme editor | template switcher, preview resource picker, Theme settings tab, header and footer groups, alternate templates and template choice on products, collections and pages, landing pages using the theme header and footer | 4 |
| 6 | Theme library and history | multiple themes, duplicate, rename, preview links, publish another theme, delete, export/import theme files, `versions` table and History for themes and landing pages, pruning job | 4, 5 |
| 7 | Cart and checkout (**Confirm**) | cart (cookie, no account), Add to cart, cart page and drawer, multi-line COD checkout through `place_order_lines` + `place_checkout`, discounts and delivery as today, incomplete-order drafts for carts | 4 |
| 8 | Preferences and polish | Preferences screen, password page, search page, all-products and all-collections pages, a second starter theme | 4 |

Phases 1–3 can run in parallel. Phase 4 is the largest piece and the riskiest: plan about two working sessions for the migration and its browser check alone.

## Out of scope (and why)

- **Code themes, Liquid, theme marketplace:** see Decision 1.
- **Blog posts:** Shopify has them, but our sellers sell through Facebook; add them if sellers ask.
- **Metafields and metaobjects:** context blocks cover product details; revisit when a seller hits a wall.
- **Multi-language storefront and multiple currencies:** stores are Bangla, in taka.
- **Automatic collection rules and storefront filters beyond price and stock:** these come later, as CLAUDE.md already says.
