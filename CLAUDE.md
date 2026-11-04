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
| CDN, custom domains | Cloudflare, Cloudflare for SaaS |
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

## Development

- `npm run db:start`, then `npm run db:migrate`, then `npm run dev` (dashboard on port 5173, API on 8787, storefront on 8788 at `http://{store}.localhost:8788`, Postgres on 5433).
- `npm test` runs API tests against the `uddokta_test` database. `npm run build` type-checks both apps and builds the dashboard.
- Schema changes: edit `apps/api/src/schema.ts`, then `npm run db:generate -w api`. Row-level security and triggers go in custom migrations.
- For small UI changes, run the build and check the affected screen. Do not run long full-app browser tests unless the change is broad.

## Store customization

1. Style presets: one click sets colours, fonts and corners.
2. Section editor: add, drag and configure sections with a live preview.
3. Limited custom CSS on paid plans, later. No Liquid-style theme language.

## Navigation

Follow Shopify's approach: a black left sidebar with sub-items that expand under the active parent and Settings pinned at the bottom with the store and account menu under it. There is no top bar and no global search for now; phones get a small bar with the menu button.

- **Home**
- **Orders:** Incomplete orders, Fake-order protection
- **Products:** Collections, Inventory, Warehouses
- **Customers:** Segments, Repeat sales
- **Inbox:** AI salesman
- **Marketing:** Auto follow-ups, Offers
- **Discounts**
- **Media**
- **Analytics:** Expenses
- **Team:** Tasks, Attendance
- **Landing pages** (first under Sales channels)
- **Online store:** Themes, Pages, Menus
- **Settings:** Store, Couriers, Payments, SMS, Tracking, Domains, Team, Billing, Referrals

## Media gallery

Files live in Cloudflare R2 (`.media/` in development), and the `media` table holds their details. Never store uploads in the repo. The API converts every image to WebP, strips its metadata and makes a thumbnail.

One picker used across products, pages, themes and the logo. It shows where each file is used, blocks deleting a file that is live, compresses images automatically and counts against a per-plan storage limit.

## Products

- Every product has at least one variant, so price and stock always live on `product_variants`. Options generate one variant per combination, up to 100.
- Amounts are whole taka in integer columns. Blank stock everywhere means it is not tracked.
- Buying prices live in `product_variant_costs`, which row-level security hides from staff. Staff saves leave the field out and keep the existing price.
- Staff can add and edit products; only owners and admins can delete them.
- Statuses: active (listed and on sale), unlisted (on sale through its direct link, never in listings or search), draft (hidden). The storefront must honour all three.
- Descriptions are HTML. `cleanDescription` in `apps/api/src/products.ts` allows a few tags with no attributes, plus links with an http, https, mailto or tel `href`, and it is the only thing that makes them safe to render.
- Each product has a `handle`, unique in its store and allowed to contain Bangla. Saves keep it when the name changes. A blank search title or description means the storefront uses the name and `searchDescription` from `apps/dashboard/src/product-form.ts`.
- A variant image must be one of its product's images, enforced by a deferred foreign key to `product_media`.
- `product_media` has a deferred foreign key to `media`, which is what blocks deleting an image in use.

## Inventory

- One list of every variant, with stock edited in place, one warehouse at a time, and saved together. There is no stock history.
- Stock lives in `warehouse_stock`, one row per variant per warehouse. No rows means not tracked. A trigger keeps `product_variants.stock` equal to the total, so read that column for totals and never write it. Change stock through `setStock` in `apps/api/src/stock.ts`.
- Every store has at least one warehouse, made with the store, and the API refuses to delete the last. Deleting a warehouse moves its stock to another.
- Orders must change stock by adding or subtracting in the database, never by writing back a number read earlier, and must say which warehouse a sale ships from.

## Collections

- Sellers pick a collection's products by hand and drag them into order. Automatic rules (by tag, price) come later if sellers ask.
- A collection has no status of its own. The storefront shows only its active products, so unlisted and draft ones stay hidden even when they are in a collection.
- Staff can add and edit collections; only owners and admins can delete them. Deleting one never deletes its products.

## Landing pages

- `pages` holds a `draft` and a `published` JSON copy. Saving changes only the draft; Publish copies it. Saves send `revision`, and a stale one gets 409 `pageChanged` instead of overwriting.
- Sections live in `apps/storefront`: `schema.ts` (settings schemas, `readContent` validation, no JSX so the API imports it) and `sections.tsx` (stateless components). The storefront renders them to HTML; the editor renders the same components into an iframe preview. The editor's forms are generated from the schemas.
- Images a page uses are kept in `page_media` (draft and published), which blocks deleting them.
- The storefront has no signed-in user and reads only through `storefront_page`, `storefront_media` and `storefront_products`. The order form is a plain HTML form; its small script only updates the shown total.

## Orders

- Every order, from the storefront or typed in by the team, goes through `place_order`. It prices the order from the variant and the store's delivery charges (`stores.delivery_inside/outside`, set in Settings › Store), takes stock and records the warehouse. App code never sends an amount.
- Status changes go through `set_order_status`, which holds the allowed steps (new → confirmed/hold/cancelled, confirmed → packed, packed → courier, courier → delivered/returned). Cancelling or a return adds back what `order_items.stock_taken` says the sale took.
- Storefront orders are limited to 5 per phone per hour, and a hidden form field catches bots. Typed-in orders have no limit.

## Design rules

- Do not use the Hallmark skill or its linter in this project.
- Blend of Shopify's admin and a modern analytics dashboard. From Shopify: black frame and sidebar, rounded content panel, dense tables with a filter bar. From the dashboard: large page title with a one-line description, green primary and active state, a stat row with sparklines and charts on Home.
- Our own code, name and logo. Never Shopify's logo, assets or copy.
- Neutrals plus one green; other colours only for status badges and errors. 14px body text, thin borders, 8px controls, 12px cards.
- Standard input field: the `.input` class. White, 32px, thin `--color-rule-strong` border, 8px corners, 13px text, no shadow, and a green outline on focus.
- Small controls by default: buttons and inputs are 32px with 13px text. Only sign-in forms use 40px, and phones use 44px touch targets.
- Buttons are tactile, like Polaris: a bevel from layered inner shadows (light top edge, dark bottom edge) that inverts when pressed. Shadows come from tokens.
- Charts are inline SVG with no chart library. Never invent figures: sample data is labelled as sample.
- Colours, spacing and type come from tokens, never one-off values.
- Bangla is chosen and tested first; English fits around it.
- Plain seller language. Every empty state says what to do next.
- **Never:** gradients, emoji icons, stat cards beyond one row, oversized rounded corners, decorative glass or glow effects, or anything that reads as generic AI output.

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
