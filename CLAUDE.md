# Uddokta

Bangla-first commerce SaaS for Bangladeshi sellers who take orders through Facebook and cash on delivery. It covers the feature set in `winningseller-analysis.md`, with Shopify-style navigation, a polished minimal design and a media gallery for each store.

Use the analysis as a feature reference only. Write our own copy, guides and branding; never reuse WinningSeller's or Shopify's text, logos or assets.

## Stack (decided, do not change without asking)

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Dashboard | React + Vite single-page app, React Router |
| API | Hono on Node.js |
| Storefront | Hono rendering React to HTML on the server, JavaScript only where needed (cart, checkout) |
| Page editor | Same React section components as the storefront |
| Database | Managed PostgreSQL + Drizzle |
| Background jobs | pg-boss |
| Media | Cloudflare R2, images resized at upload with sharp |
| CDN, store domains | Cloudflare (`uddokta.live` DNS, R2, CDN) |
| Sellers' own domains | One Caddy proxy on Fly.io with a fixed IPv4; on-demand certificates approved by our API, forwarded to the storefront |
| Hosting | Railway (app and Postgres). Its filesystem does not persist, so uploads never go on local disk in production |
| UI primitives | Radix + our own design tokens |
| Packages | npm workspaces |

**Do not use:** Next.js, Vercel, Polaris (its license is for Shopify apps), microservices, Kubernetes or Kafka.

**Add only when the need is measured:**
- Redis: repeated reads slow the database
- Read replicas: reports slow order processing
- ClickHouse: analytics queries get slow on Postgres
- Typesense: Postgres search fails, especially for Bangla
- Separate services: one part needs its own team or scaling profile

## Architecture rules

- Every tenant table has `store_id`, enforced with Postgres row-level security.
- API, storefront and workers are stateless and deploy separately.
- Storefront pages are cached at the CDN and purged when a seller publishes.
- Page views and ad events never share tables with orders.
- Money is calculated by the system, never by AI.
- Pages are versioned JSON, with draft and published states.
- Each section declares a settings schema, and the editor form is generated from it.

## Accounts and stores

- `users`, `stores` and `store_members (user_id, store_id, role)`: many-to-many. Roles are owner, admin and staff.
- A user can exist with no store. A store always has an owner: this is enforced by deferred triggers in the database, not only in code.
- Team members join through single-use invite links that last 7 days, sent by the owner (for example on WhatsApp). No email provider is needed.
- Dashboard URLs are `/store/:handle/...`. Screens outside a store (`/stores`, `/stores/new`) use the account layout.
- Every API query goes through `tx()` in `apps/api/src/db.ts`, which drops to the restricted `uddokta_app` role and sets the user for one transaction. Never query outside it. New tenant tables need `store_id`, row-level security policies and a test proving another store cannot reach them.
- UI permission checks are only for display. The database and API are the real enforcement.
- Settings › Team shows what each role can do from `apps/dashboard/src/permissions.ts`. That list only explains the rules: when a role rule changes in the database or API, update it in the same change.

## Development

- `npm run db:start`, then `npm run db:migrate`, then `npm run dev` (dashboard on port 5173, API on 8787, storefront on 8788 at `http://{store}.localhost:8788`, Postgres on 5433).
- `npm test` runs API tests against the `uddokta_test` database. `npm run build` type-checks both apps and builds the dashboard.
- Schema changes: edit `apps/api/src/schema.ts`, then `npm run db:generate -w api`. Row-level security and triggers go in custom migrations.
- For small UI changes, run the build and check the affected screen. Do not run long full-app browser tests unless the change is broad.

## Store customization

1. Style presets: one click sets colours, fonts and corners.
2. Section editor: add, drag and configure sections with a live preview.
3. Page fonts (`content.fonts`: a Bangla and an English font from the fixed Google Fonts list `pageFonts` in `themes.ts`; blank keeps the theme's; applied to `.sf-page` by `pageFontCss`). Per-element fonts may come later.
4. Custom CSS per landing page (`content.css`, in the editor's Page settings). `readContent` refuses `<` and more than 20,000 characters so it can never leave its `<style>` tag. Plan limits come with billing. No Liquid-style theme language.

The page editor's top bar has back, then icon toggles for the sidebar (Sections: list plus the selected section's settings; Page settings: full height, including Custom CSS in a lazy-loaded CodeMirror editor, `components/CssEditor.tsx`; Custom HTML blocks use `HtmlEditor.tsx`, both built on `CodeEditor.tsx`, with a Format code button that lazy-loads js-beautify), with the title and status centred. On phones the top bar is one line (back, title, status, view live, Save, Publish) and a bottom dock of equal tabs holds Page settings, Undo, Redo, Sections and Preview; tapping a section opens its settings and closing them returns to the list.

## Navigation

Follow Shopify's approach: a black left sidebar with sub-items that expand under the active parent and Settings pinned at the bottom with the store and account menu under it. There is no top bar and no global search for now; phones get a small bar with the menu button.

- **Home**
- **Orders:** Incomplete orders, Fake-order protection
- **Products:** Collections, Inventory
- **Customers:** Segments (coming soon), Repeat sales
- **Inbox:** AI salesman (both coming soon)
- **Discounts**
- **Media**
- **Analytics**
- **Landing pages** (first under Sales channels)
- **Online store:** Themes, Pages (coming soon), Menus
- **Settings:** Store, Team, Notifications, Payments (coming soon), Warehouses, Delivery, Couriers, Invoices, SMS (coming soon), Domains, Tracking, Billing (coming soon)

The current development focus is landing-page COD selling. Keep Online store and its existing working tools accessible while deferring further store development. Keep planned Inbox, AI salesman, Segments, Payments, SMS, Billing and store-information Pages visible, with a Coming soon label and a clear planned-feature screen. These remain on the implementation roadmap; do not remove them merely because they are unfinished. Only Marketing, Auto follow-ups and Offers were approved for removal. Add future features as built-in tools, without a separate Apps section.

## Media gallery

Files live in Cloudflare R2 (`.media/` in development), and the `media` table holds their details. Never store uploads in the repo. The API converts every image to WebP, strips its metadata and makes a thumbnail.

One picker used across products, pages, themes and the logo. It shows where each file is used, blocks deleting a file that is live, compresses images automatically and counts against a per-plan storage limit.

## Products

- Every product has at least one variant, so price and stock always live on `product_variants`. Options generate one variant per combination, up to 100.
- Amounts are whole taka in integer columns. Blank stock everywhere means it is not tracked.
- Buying prices live in `product_variant_costs`, which row-level security hides from staff. Staff saves leave the field out and keep the existing price.
- Staff can add and edit products; only owners and admins can delete them.
- Statuses: active (listed and on sale), unlisted (on sale through its direct link, never in listings or search), draft (hidden). The storefront must honour all three.
- Descriptions and layout Text elements are rich text. `cleanRichText` in `apps/storefront/src/rich.ts` allows a few tags with no attributes, plus links with an http, https, mailto or tel `href`, and it is the only thing that makes them safe to render. The API runs it on save (`cleanDescription`, and `readContent` for `richtext` fields); the layout renderer runs it again before drawing, so the editor preview is safe too.
- Each product has a `handle`, unique in its store and allowed to contain Bangla. Saves keep it when the name changes. A blank search title or description means the storefront uses the name and `searchDescription` from `apps/dashboard/src/product-form.ts`.
- A variant image must be one of its product's images, enforced by a deferred foreign key to `product_media`.
- `product_media` has a deferred foreign key to `media`, which is what blocks deleting an image in use.

## Inventory

- One list of every variant, with stock edited in place, one warehouse at a time, and saved together. There is no stock history.
- Stock lives in `warehouse_stock`, one row per variant per warehouse. No rows means not tracked. A trigger keeps `product_variants.stock` equal to the total, so read that column for totals and never write it. Change stock through `setStock` in `apps/api/src/stock.ts`.
- Every store has at least one warehouse, made with the store, and the API refuses to delete the last. Deleting a warehouse moves its stock to another.
- Orders must change stock by adding or subtracting in the database, never by writing back a number read earlier, and must say which warehouse a sale ships from.
- The inventory list also edits SKU, barcode and the low-stock alert (`product_variants.low_stock`, compared with the total). "In orders" counts units on unshipped orders, which are already taken out of stock.

## Collections

- Sellers pick a collection's products by hand and drag them into order. Automatic rules (by tag, price) come later if sellers ask.
- A collection has no status of its own. The storefront shows only its active products, so unlisted and draft ones stay hidden even when they are in a collection.
- Staff can add and edit collections; only owners and admins can delete them. Deleting one never deletes its products.

## Landing pages

- `pages` holds a `draft` and a `published` JSON copy, plus `published_meta` for the public title, handle and SEO fields. Draft metadata never changes a live page; publishing snapshots it with the content. Live and draft handles share a store-scoped reservation namespace. Saving changes only the draft; Publish copies it. Saves send `revision`, and a stale one gets 409 `pageChanged` instead of overwriting.
- Sections live in `apps/storefront`: `schema.ts` (settings schemas, `readContent` validation, no JSX so the API imports it) and `sections.tsx` (stateless components). The storefront renders them to HTML; the editor renders the same components into an iframe preview. The editor's forms are generated from the schemas.
- Page content is version 2 only (`readContent` refuses anything else). A page is a list of sections: built-in typed sections, plus `layout` sections that hold a tree of nodes (`PageNode` in `schema.ts`): boxes (flex or grid containers, nestable at most 4 boxes deep (`maxBoxDepth`, enforced by `readContent` and checked in the editor before adding, pasting, dropping or growing a grid), max 400 nodes a page) and elements (heading, text, image, button, icon, divider, spacer, video, and `block`, which embeds any built-in section such as the order form inside a layout). Each node has content (`props`), desktop `style`, `hover` (Style-tab values only, edited with the Normal/Hover switch, falling back to the normal look like phone values fall back to desktop; rendered last inside `@media (hover:hover)`, and drawn in the editor preview while being edited) (borders are one width per side, `border{Top,Right,Bottom,Left}Width`, plus `borderStyle` solid/dashed/dotted; the older all-sides `borderWidth` still renders and is split up on the first edit; corners likewise are `radius{TopLeft,TopRight,BottomRight,BottomLeft}` over the older `radius`), phone overrides (`mobile`, under 720px) and `hide`. Style values come from the fixed list `nodeStyleFields`, so `layout.tsx` turns them into one generated stylesheet without escaping. Rows share width with gaps and stack on phones unless a phone direction is set. Boxes can also be grids (`display: grid`, `gridColumns` × `gridRows`, items with `colSpan`/`rowSpan`); grids are the main layout tool (structures in Add element are grids, `setGrid` adds or trims empty cells and never removes one with content), and on phones a grid is one column unless a phone column count is set.
- Every section is edited as a layout. `toLayout` in `apps/storefront/src/convert.ts` turns a built-in section into one: simple sections (image with text, CTA, announcement, video, card and list sections) become elements; the rest (order form, FAQ, reviews, gallery, countdown, contact, header, footer, …) become a block in a layout. New pages, templates and the editor's page load go through it, so sellers never see the old fixed sections. "Add section" offers only generic pieces (`sectionPresets` in `layout-tree.ts`: only the empty section); purpose-made pieces (order form, reviews, FAQ, …) are blocks added inside a section. A section is the page's top level: its panel is the container (name edited in the panel header, then Layout: content width, margin, padding; Style). Sections are listed by their seller-only `name` (preset or original section name when created; "Section N" when blank), never by their content. The ready-made pieces appear only in Add section; Add element offers elements, blocks and an empty box. Tree arrows only open and close (selection never does that), and selecting something opens the tree down to it. The renderer still draws typed sections, because blocks use them.
- A block's look settings are the `group: 'layout'` fields of its schema; the editor shows them at the top of the Style tab (`BlockStyleForm`), and the Content tab holds only its content. List items (every `list` field) are rows: drag handle (drag, or arrow keys), the item's icon, its title (click opens it), duplicate and delete.
- Icon list block: items are icon + one line of text + optional link (no heading); settings: vertical/horizontal, alignment, item and icon spacing, icon size and colour, text colour, dividers (style, width, colour); hover: icon and text colour per item. Block hover settings are named `<name>Hover<rest>` (iconHoverColor), shown under the Style tab's Hover state, fall back to the normal setting, and are drawn by the preview while Hover is being edited.
- The Hero banner block was retired: migration `0077_hero_to_image_text` turned saved hero sections and blocks into Image with text. The Text and Image blocks were retired too: `retireOldBlocks` in `convert.ts` turns them into elements (a box keeping the block's id and style), run on saved pages by the data step in `apps/api/src/migrate.ts` (idempotent, ids deterministic so draft and published stay equal, revision bumped) and on imported files. Retire other old blocks the same way (rewrite saved pages to a kept type in a migration first, then delete the type), so no saved page ever holds a type `readContent` no longer knows.
- Add element lists Blocks (`currentBlocks` in `PageEditor.tsx`: icon list, Custom HTML) and, under Obsolete, every other older block until it is redone and moved up. Custom HTML (`html` block, `html` field kind) is stored exactly as the seller wrote it (HTML, `<style>`, scripts, outside libraries, forms; the seller is responsible for it) and is part of the live page as written; a page with one gets the open CSP (`openCsp` in `server.tsx`, chosen by `hasCustomHtml`), other pages keep the hash-only CSP. Platform safety rests on the dashboard being another origin: host-only session cookie and the API's origin check. It must never run in the dashboard: it is inserted into a page only when `ctx.live` is true, which only the storefront server sets; the editor preview draws it in place after DOMPurify (`previewHtml` in `PageEditor.tsx` via `ctx.previewHtml`: scripts, handlers, script URLs, frames removed; `<style>` kept; preview forms never submit), and any other render without that cleaner gets a scripts-off frame (`EmbedFrame`, `sandbox="allow-same-origin"` only). Never set `live` in the dashboard or insert the value into its DOM. Its https stylesheet links (`customHtmlCss`) are added to the preview document. It is stored as a length-checked string through parameterised queries and never evaluated on the server.
- Layout CSS weight: base rules in `layoutBaseCss` (and storefront rules that style layout nodes) weigh one class (put tags or extra classes in `:where()`), so the per-node `.n-<id>` rules, written later, always win.
- Order forms are found only through `orderBlocks()` (order sections and order blocks in visible layouts); the storefront's order handler and the page's default button link both use it.
- The editor's layout tools: structure tree under a layout section (drag to reorder or drop into a box), click in the preview to select any element, click a selected heading, text or button again to type on the page, Add element dialog (elements, blocks, ready-made layouts in `apps/dashboard/src/layout-tree.ts`). In the editor preview every box has a faint dashed outline, inset a little more per nesting level (no padding is added), so nesting stays visible. The hovered or selected box's solid outline and its handle sit at the box's real edge (outline just inside), so content never looks outside its box. Boxes and layout sections show a small handle in the preview that selects them (even when empty). Copy/paste (⌘C/⌘V, or the panel buttons) keeps a section or element in this browser's localStorage (`writeClip`/`readClip`), so it pastes into other pages too; the right-click menu's Paste style puts the copied item's desktop, phone and hover styles (and a block's look settings) onto an item of the same kind (same element kind and block type, or section on section), keeping its content; ⌘D and the tree's hover icon duplicate. Tree edits are the pure functions in `layout-tree.ts`; duplicates get fresh ids (`reId`), because ids must be unique on a page.
- Element panels have Content, Style and More tabs (More: layout, position, size, spacing, transition duration/easing, device visibility). Buttons have an icon position (before/after the text) and a Style › Background group: Classic (colour) or Gradient, from the same gradient settings as sections (`gradientLeaves` in `schema.ts`, `BackgroundTypeRow` and `GradientControls` in `SectionDesignControls.tsx`); element gradients merge phone and hover values with the desktop ones. Two-choice selects in content forms show as a joined-button switch. Buttons also have an attention animation on the More tab (pulse, shake, bounce, shimmer, glow; slow/normal/fast), rendered as `data-anim` attributes styled in `layoutBaseCss` and switched off under `prefers-reduced-motion`. Section style (`styleFields`): background is none, colour, gradient (two colours with positions 0–100%; linear with an angle, or radial with a shape and starting point; built only by `gradientCss` in `sections.tsx`), image (fit, position) or video (a direct https .mp4/.webm, muted and looping, with the image as poster), plus an overlay colour and strength for image and video; `SectionFrame` draws these as layers behind the section. Min height centres the content. Top and bottom spacing go to 300px. The storefront CSP allows `media-src https:` for background video.
- The editor is dark: `.editor` redefines the colour tokens, and dialogs opened from it follow. The preview iframe keeps the page's real colours.
- Images a page uses are kept in `page_media` (draft and published), which blocks deleting them.
- The storefront has no signed-in user and reads only through `storefront_page`, `storefront_media` and `storefront_products`. The order form is a plain HTML form; its small script only updates the shown total.

- New landing pages start as a blank canvas: the Create landing page dialog asks only for the name. The ready-made templates (`campaigns.ts`) were removed; the create API refuses `template`/`productId`. All created/duplicated/imported pages start unpublished.
- Export/import: the page list exports a page's draft and settings with its images' storage details as a file signed with a key derived from `COURIER_KEY` (`signExport`/`verifyExport` in `secrets.ts`); only unchanged signed files import. Import always creates a new unpublished page (page-limit lock, `readContent` and `checkReferences` as usual): images already in the store are kept, other platform images are copied in through `saveImage` (counting against storage), missing images and products the store lacks are blanked (`remap` in `pages.ts`).
- The page-list Duplicate action copies the saved draft into a separate page, including media references and SEO fields. Creation and duplication share the store page-limit lock. A copy must never change the source page or its published content.

## Orders

- Every order, from the storefront or typed in by the team, goes through `place_order_lines` (`place_order` is its one-product form, used by the storefront). It prices every line from its variant and delivery from the buyer's chosen option through `shipping_charge` (see Delivery options), takes stock and records the warehouse. All tracked lines ship from one warehouse, because cancels and returns put stock back into `orders.warehouse_id`. App code never sends an amount.
- Status changes go through `set_order_status`, which holds the allowed steps (new → confirmed/hold/cancelled, confirmed → packed, packed → courier, courier → delivered/returned). Cancelling or a return adds back what `order_items.stock_taken` says the sale took.
- Public forms carry a random checkout UUID. `place_checkout` serializes retries, calls `place_order` once, and records the number/total in tenant-scoped `checkout_receipts`. Reusing a completed token with different values is refused. Confirmation reads an opaque receipt through `storefront_receipt`, never an amount from the URL.
- Storefront orders are limited to 5 per phone per hour, and a hidden form field catches bots. Typed-in orders have no limit.

- Order filters and CSV export share `orderWhere` in `apps/api/src/order-query.ts` and the validated filter contract in `apps/storefront/src/order-filters.ts`. Dates are Bangladesh order-creation dates; end dates include the whole day. Status counts ignore the selected status but honor search/source/date filters.
- Saved order views belong to one member in one store and use `order_views` row-level security. Keep rolling periods relative rather than saving today's resolved dates. Enforce the 20-view limit under the per-member/store advisory lock.
- CSV exports include all matching orders up to 10,000, never just the loaded page or a silently truncated result. Quote CSV fields, neutralize formula-like text, preserve phone numbers as text, and omit buying prices. Abort stale browser exports when filters or stores change.

- Keep Orders compact: one toolbar for search and saved views, advanced filters in a dialog, and concise rows/cards. Do not show customer phone numbers under names in the order list; keep them in order details and retain phone search. Use actual scoped counts for summaries and label any QA preview data as sample.

## Sales tools

- Discounts (`discounts`, `discount_products`): amount off the order, amount off chosen products (percent, or a fixed amount per item), buy X get Y (value = percent off the cheapest qualifying items, 100 = free) and free delivery. Each is a code or automatic (no code, with a title shown on the order form via `storefront_offers`), with minimum amount or quantity, total use limit, once per phone, start/end dates and on/off.
- Only `discount_amount()` (migration 0075) works out what a discount takes off. `pick_discount()` gives each order one discount, the typed code or the best automatic one, whichever saves more, and counts its use in the statement that checks the limit. A typed code that does not apply is refused. `place_order` returns the order number and the total; show that total, never one worked out in app code.
- An empty product list means no products, never all: deleting a product can only narrow a discount. Order edits re-run the order's own discount on the new lines; a deleted discount keeps the agreed amount.
- Incomplete orders: the page script saves what a buyer typed once the phone is valid (`save_checkout_draft`), one row per number, swept after 90 days. Ordering marks it ordered.
- Fake-order protection: `blocked_phones` refuses storefront orders (typed-in orders still work). Repeat orders for the same product within 24 hours are marked, never refused.
- Repeat sales: buyers whose last order was delivered `days` ago and who have not ordered since; a logged call hides them for 7 days, or 90 if not interested.
- Profit (owners and admins only): delivered sales − buying price copied at sale (`order_item_costs`). Delivery charges go to the courier and are left out.
- Out of scope: expense tracking, team tasks, attendance and referral pages. We are not a bookkeeping, project or HR tool.
- Couriers: Steadfast logins are encrypted with `COURIER_KEY` (`apps/api/src/secrets.ts`) and never returned. Booking locks the order row so a double click cannot book twice. `STEADFAST_URL` points tests at a stand-in. Self delivery (`courier = 'self'`) is turned on in Settings › Couriers by owners and admins; sending an order that way records a shipment with no booking or tracking, and the team marks it delivered or returned by hand.
- Settings › Store is the business itself (name, logo, favicon, contact, address, optional registration), never online-store settings. The favicon is shared by every sales channel: the storefront serves it at `/favicon.ico` (`storefront_favicon`) and every page links there. Settings › Invoices holds what printed orders add; its header reads the Store details.
- Icon fields hold a library icon name or `media:<id>` (the seller's own PNG/JPG/SVG from the media gallery; `mediaIconId`/`isIconValue` in `icons/catalog.ts`). Own icons are page images in `references()` (so they cannot be deleted while used) and are drawn by `MarketingIcon` with the `image` lookup from `ctx`. SVG uploads are rasterised to WebP like every image; no SVG is served.
- Style presets live in `apps/storefront/src/themes.ts`; the storefront and the editor preview both apply them.
- Ad pixels are written into page scripts, so their IDs are format-checked in the API, the database and again before rendering. Each response's CSP allows its own inline scripts by hash.

## Delivery options

- `shipping_rates` replaces the old fixed inside/outside charges. A store has any number of options (name, area note, price, on/off, order), and buyers choose one on the order form. Orders keep `shipping_rate_id` and a copy of the name in `shipping_name`. Deleting an option leaves past orders as they were.
- Delivery is free when any of an option's conditions holds: products total (before coupon) ≥ `free_over`, item count ≥ `free_min_qty`, or the order includes a product in `shipping_rate_products`. Only `shipping_charge()` in the database decides. The storefront script and dashboard previews repeat the rule for display only.
- Store creation asks for the inside/outside Dhaka charges and turns them into the first two options; Settings › Delivery manages them. The API refuses to turn off or delete the last active option. Owners and admins edit; staff read.
- Editing an order keeps its agreed charge on the same option unless the free conditions change; another option is priced afresh.

## Notifications

- The bell sits beside the logo in the sidebar and at the end of the phone top bar. Its panel opens what each notification is about, and Settings › Notifications holds the choices.
- Only database triggers create notifications, through `notify()` in migration `0065`. Never insert them from app code: storefront and courier paths must be covered too. The person who caused an event is never notified about it.
- `data` is a snapshot (number, name, product), so text reads the same later. New kinds need the check constraints, `notification_default()`, the kind lists in `schema.ts` and `components/Notifications.tsx`, text in `describe()` and a test.
- Incomplete orders are announced only after 15 minutes left open, because every storefront order saves a draft first.
- Browser pop-ups and sound are per device (`localStorage`); what a member receives is per store (`notification_settings`).

## Design rules

- Do not use the Hallmark skill or its linter in this project.
- Blend of Shopify's admin and a modern analytics dashboard. From Shopify: black frame and sidebar, rounded content panel, dense tables with a filter bar. From the dashboard: large page title with a one-line description, green primary and active state, a stat row with sparklines and charts on Home.
- Our own code, name and logo. Never Shopify's logo, assets or copy.
- Neutrals plus one green; other colours only for status badges and errors. 14px body text, thin borders, fully round (pill) controls, 12px cards. Boxes that hold several lines, lists or pictures keep soft corners (`--radius-box`, `--radius-media`).
- Lists use the one data table (`.data-list`, `.filter-bar`, `.data-table`; see the comment in `app.css`). One value per cell: phone, email, address and links get their own columns; only phones stack them. Bulk actions use `components/Selection.tsx`.
- Standard input field: the `.input` class. White, 32px, thin `--color-rule-strong` border, pill-shaped with 12px side padding, 13px text, no shadow, and a green outline on focus.
- Small controls by default: buttons and inputs are 32px with 13px text. Sign-in forms use 40px.
- Mobile components should be more compact than their desktop equivalents, following the page editor: reduce 16px text to 14px and 14px text to 13px, with tighter line spacing and padding. Use 32px buttons with 13px text and compact 32–36px icon buttons and list controls. Keep related actions on one row where they fit; icon-only buttons need accessible labels. Editable inputs keep 16px text (to avoid iPhone focus zoom) at 36px height; buttons stay 32px. Never add per-page overrides to undo the global mobile sizes. Apply these sizes to the dashboard controls; the storefront preview must retain the storefront's own responsive styles.
- Buttons: white ones have a thin edge and a soft drop shadow; filled ones (primary, danger) have a top-to-bottom sheen in the brand colour with a light top edge and a soft shadow, and look pressed in when clicked. Shadows come from tokens.
- Dialogs are native `<dialog>` (`.modal` centred, `.picker` a floating side sheet, `.drawer` the phone menu) and animate both in and out. Build them from `components/DialogHead.tsx` (title and round close button), `.dialog__body` and `.dialog__foot`; a dialog's own class sets only its width and inner layout. Edge-to-edge choices use `.dialog-list`. Close them only through `useDialog` in `components/dialog.ts`: `close()`, or `close(then)` for actions like Done. Its props close on a backdrop click (sent as a cancel, so a dialog's own `onCancel` guard still applies). Never unmount them directly, or the exit animation is skipped.
- Page editor section settings use the same scale as the rest of the dashboard: `.input`, `.input-affix` and `.btn` for fields, 13px labels, 28px segmented toggles, tokens only (see the "Section settings" block at the end of `app.css`). Do not add one-off pixel sizes or hex colours there. The builder's settings panels are the one exception to pill controls: they use 4px corners, joined segment buttons and Elementor-style joined spacing fields (four sides plus a link button, side names underneath), in our colours.
- Charts are inline SVG with no chart library. Never invent figures: sample data is labelled as sample.
- Colours, spacing and type come from tokens, never one-off values.
- Bangla is chosen and tested first; English fits around it.
- Plain seller language. Every empty state says what to do next.
- Status badges and Soon tags are small uppercase pills (Bangla keeps a readable size, it has no capitals).
- Colours are picked with `components/ColorPicker.tsx` (area, hue, opacity, one row of 9 recently used colours kept per browser), used through `ColorControl`, which opens it in a browser popover anchored to the field with a small pointer at the swatch. A colour joins Recent when its popover closes or when it is pasted into the HEX field (applied whole, # optional), never while dragging; use it for any new colour field. Colours are `#RRGGBB` or `#RRGGBBAA` when see-through, and the schema accepts only those.
- **Never:** gradients other than the filled-button sheen and the colour picker's own hue/opacity/area fills and the Gradient background-type icon, emoji icons, stat cards beyond one row, decorative glass or glow effects, or anything that reads as generic AI output.

## Build order

1. Design system and app shell
2. Store accounts, team and products, with the media gallery
3. Storefront and COD checkout, with a few fixed layouts
4. Orders
5. Courier booking (Steadfast and Pathao first)
6. Fake-order protection
7. Repeat sales calls
8. Analytics and profit
9. Theme and page builder
10. AI features
