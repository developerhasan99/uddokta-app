# Uddokta improvement plan

Reviewed 6 November 2026. Product scope: Bangla-first, mobile-first landing pages and COD order operations. Build capabilities into Uddokta; no Apps marketplace or separate Apps section. Online-store development is deferred.

## What the comparison shows

The app already has substantial foundations: tenant-isolated accounts, product variants, warehouse inventory, draft/published pages, a shared live editor, undo/redo and section duplication, COD checkout, incomplete-checkout capture, discounts, blocked phones, order transitions, Steadfast booking, repeat-sales calls, and profit reporting. Those should be made easier to use and more dependable before adding unrelated commerce modules.

Biponix was inspected through the signed-in Chrome session, without saving changes, creating funnels or orders, or changing its settings. Its funnel list, create-funnel form, order list and filters, manual order form, general settings, and checkout settings were reviewed. Some controls were inspected only as forms; their successful operation was not tested. The account's funnel and order lists were empty.

Observed differences:

| Area | Observed reference | Uddokta assessment and decision |
| --- | --- | --- |
| Landing-page setup | Biponix groups product, variant, quantity, layout, and SEO options in funnel creation | At the initial review, our new-page flow started with a name and blank editor. Batch 2 adds guided product selection and two reusable starting layouts while preserving the blank canvas. |
| Finding campaigns | Biponix has funnel search, filters and saved views | Our page list had no search or filters. Search, status filters, sorting and live-link actions are now implemented. |
| Daily order work | Biponix exposes date/filter controls, saved views, refresh, export and table settings | Our search/status filters are useful, but date/source filters, export, saved views and batch workflows remain gaps. Start with date/source filters and a correctly scoped export. |
| Manual orders | Biponix exposes adding products, customer selection, notes and tags | Our manual form takes one variant. Multi-line orders and returning-customer lookup would reduce work; they require transactional checkout/inventory changes, not just extra form rows. |
| Checkout | Biponix exposes quantity limits, promo-code presentation, field settings and reassurance copy | Keep our low-friction COD flow. Add carefully limited seller controls and clearer delivery/returns/support content before broad checkout customization. |
| Store settings | Biponix groups identity, contacts, shipping, checkout and tracking | Our settings cover the operational essentials but need richer seller contact/policy details and clearer setup guidance. Avoid collecting fields that do not serve landing-page sales. |
| Navigation | Biponix includes POS, brands, online-store tools and an Apps section | These do not define our scope. Keep the existing online-store tools accessible. Restore planned feature links with Coming soon labels; do not copy POS, brands or an Apps marketplace into our scope. |
| Onboarding | Our own review found theme/billing tasks without completion checks and a permanently closed status | Replaced with three measurable steps and a status based on published pages. Delivery charges remain a separate reminder rather than a falsely completed task. |
| Mobile customers | Our metadata columns disappeared on phones and squeezed names at intermediate widths | Customer summaries now retain order, delivered, returned, spent and last-order information on narrow layouts. |

Shopify's official documentation independently supports searchable/filterable order views, reusable views, order export, and abandoned-checkout recovery as established order-operations patterns. It does not establish that every Shopify capability belongs in Uddokta.

Sources:

- [Biponix dashboard reviewed in Chrome](https://app.biponix.com/shops/luxerra-perfume)
- [Shopify: searching and viewing orders](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders/searching-orders)
- [Shopify: exporting orders](https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders)
- [Shopify: recovering abandoned checkouts](https://help.shopify.com/en/manual/orders/abandoned-checkouts)

## Completed in the first batch

1. **Landing-page management:** search by title or draft/live handle; All, Live, Draft and Changed filters with counts; recently updated/name sorting; URL-backed filters; no-match reset; open/copy published links directly from the list.
2. **Correct published links:** page-list API returns the published handle separately. A draft URL edit cannot change the list's live destination before publishing. Integration coverage asserts this behavior.
3. **Truthful onboarding:** product → published landing page → first order. Removed theme and billing prerequisites, removed manual test-order wording, added actual live/draft status, retained a delivery-charge reminder.
4. **Home work queue:** all-time counts and links for orders awaiting confirmation, packing, dispatch, and review on hold. These are separate from the 14-day sales charts.
5. **Mobile customer history:** compact customer summaries retain the previously hidden purchase/delivery information, including at intermediate widths.
6. **Navigation correction:** restored Inbox/AI salesman, Segments, Payments, SMS, Billing and Online store after clarification from the user. Planned destinations have Coming soon labels and explanatory screens. Working Themes and Menus retain their real screens. Only Marketing, Auto follow-ups and Offers remain removed.
7. **Loading reliability:** Home and landing-page loads now ignore stale responses after store changes/unmounting. Landing-page errors do not retain an old store's list.

## Completed in the second batch

1. **Guided creation:** choose a quick sales page, a product-details page, or a blank canvas; select a product for guided layouts; name the page; open an unpublished draft in the existing editor.
2. **Real product connections:** the API uses the store-owned product name and images and connects the order form. Quick pages have hero/order sections; detail pages add editable text and a photo gallery. No sample testimonials, policies, scarcity or benefit claims are inserted. Seller-written detail copy remains empty until supplied.
3. **Availability checks:** the picker shows active/unlisted products with at least one available variant, and the API rechecks product ownership, status and stock when creating the draft. Existing multi-variant checkout remains in use.
4. **Page duplication:** exposed the existing duplicate endpoint in the page list, with localized copy names and a guard against repeated clicks. Copies use the saved draft, including images, product links and SEO fields, with a separate handle and unpublished state. Original content and publication remain unchanged.
5. **Picker reliability:** pagination errors have a retry action, repeated Load more clicks are locked, and stale search/store responses are ignored. Single-product selections can be changed without first clearing the old choice.
6. **Checks:** production build, 14 dashboard tests, 16 page integration tests and 15 product integration tests pass. Page tests cover generated content, ownership, unavailable products, image usage, independent copies, and concurrent creation/duplication at the page limit.
7. **Browser verification:** exercised required-product validation, selection, template switching, naming, draft creation, generated phone preview and page duplication in the local development store. Verified the creation modal at desktop and 390px phone width. Removed the two exact temporary QA drafts afterward; the original published page was not edited or republished. Chrome then stopped responding, so the final 360px/short-screen and Bangla checks for the new wizard remain unverified. No production deployment or physical-phone test was performed.

The new UI and helper text are localized in Bangla and English. A reusable starting layout is not a saved-template library; sellers reuse their own saved page content through duplication.

## Completed in the third batch

- **Order filters:** search, status, source and date range compose in the URL. Dates use Asia/Dhaka with inclusive end dates. Today, last 7 days and last 30 days are rolling periods; custom dates support an open start or end. Status-tab counts use the same search/source/date scope.
- **Personal saved views:** create, update, reload and remove named views, stored per member per store with PostgreSQL row-level security. Views sync through the account rather than browser storage. The limit is 20 views per member per store; names are case-insensitively unique. Removing a view does not remove orders or reset current filters.
- **CSV export:** exports all matching orders independently of the loaded list page. A 10,000-order limit is enforced without truncation. Includes order/source/customer/item/amount/note fields and Bangladesh timestamps. UTF-8 BOM supports Bangla; CSV quoting and formula neutralization protect text fields. Phone fields are prefixed with an apostrophe to retain leading zeroes as text.
- **Navigation restored:** planned Inbox, AI salesman, Segments, Payments, SMS, Billing and information Pages are visible with Soon badges and clear planned-feature screens. Online store, Themes and Menus retain their working screens. Marketing remains removed as explicitly requested.
- **Verification:** production build and type checks pass; all 100 API tests and 14 dashboard tests pass. Eight new order tests cover Bangladesh date boundaries, rolling periods, counts, pagination/export consistency, text/formula handling, oversized exports, personal/store isolation, view CRUD and concurrent limits. Applied migrations 0056 and 0057 locally; production migration/deployment is still required.
- **Browser checks:** verified restored navigation and settings on desktop and a 390px phone layout; checked Bangla labels and control bounds at 360px. Exercised custom dates/source filters, saving/updating a view, view persistence after reload and CSV download-start feedback. The browser download-event wait stalled, so the final saved-file download was not inspected; export bytes and contents were checked in integration tests. Removed the exact temporary QA view. No orders, themes, published pages or production settings were changed.

## Planned features retained in navigation

These are planned product features, not completed functionality. Their routes remain discoverable with Coming soon labels. Further online-store work is explicitly deferred; its existing working tools remain accessible. No launch dates are promised.

| Feature | Implementation scope |
| --- | --- |
| Inbox | Connect supported message channels, organize conversations by customer, support replies and assignment, and show delivery/failure state. Define the first channel before implementing its authentication and webhooks. |
| AI salesman | Use verified store/product information, hand off to staff, and keep order prices and stock decisions in the existing commerce system. Requires the Inbox workflow and a defined human-review policy. |
| Customer segments | Build useful groups from real order history, such as repeat buyers, inactive buyers and customers with returns. Make criteria visible and link to matching customers. |
| Payments | Integrate the chosen payment provider, verify amounts and webhook authenticity, and show reliable paid/failed/refunded states. Cash-on-delivery remains available during development. |
| SMS | Connect a provider, support message templates and delivery history, and show actual send failures and available balance. Do not simulate successful sends. |
| Billing | Define plans and entitlements, integrate subscriptions/payment history, and show real invoices and usage. Do not make an unfinished billing screen a prerequisite for publishing. |
| Online store and information pages | Keep existing themes, menus and store access usable. Add store information pages and broader storefront workflows later, after the landing-page work. |

## Prioritized remaining work

These are proposals, not claims of completed functionality. Scope future batches around one usable workflow at a time.

| Priority | Improvement | Why it matters / acceptance condition |
| --- | --- | --- |
| P1 | Multi-item manual orders | Add/edit multiple variants with server-calculated totals, all-or-nothing stock changes, correct warehouse deductions and cancellation/restock. |
| P1 | Customer lookup during order entry | Find previous customers by phone and reuse their latest details without silently overwriting new input. |
| P1 | Invoice and packing-slip printing | Clear Bangla/English print layouts with order number, items, quantities, charges, discounts and customer details; hide private buying prices. |
| P1 | Publish readiness beyond the existing order-section warning | Check sellable product/variant, stock when tracked, meaningful images, delivery charges and seller support/returns content. Show the exact section or setting to fix; distinguish advice from blockers. |
| P1 | Checkout and publication reliability | Review stale-editor behavior around unpublishing, checkout error recovery, sold-out changes and retry handling. Cover concurrency with integration tests. |
| P1 | Seller contact, delivery and returns details | Store real support/contact and policy information, then reuse it in landing-page sections and checkout reassurance. Keep forms brief. |
| P1 | Account recovery and support | Provide an operational recovery route before self-service launch; do not build a form that pretends to send recovery messages. |
| P2 | Safe bulk order actions | Select multiple orders, show eligible transitions, report per-order outcomes and prevent double courier bookings. Never force invalid transitions. |
| P2 | Campaign-level performance | Track page visits, checkout starts, orders, delivered revenue and recovery, with a defined attribution window and separate event storage. Do not display fabricated conversion metrics. |
| P2 | Better incomplete-order recovery | Add search, contact history, ownership/next-call state and reliable conversion into an order. Existing capture/call/create-order actions should be extended, not recreated. |
| P2 | Stock warnings and inventory history | Surface low/out-of-stock variants and record who adjusted stock and why. Avoid adding alerts without a clear replenishment action. |
| P2 | Courier operational visibility | Show booking failures, latest status check and a retry action; add background synchronization when justified. Verify a real supported courier flow separately. |
| P2 | Tracking verification and server events | Make browser-event setup testable; consider Meta server-side events with deduplication and appropriate data handling after validating existing pixels. |
| P2 | Faster initial loading | Split heavy dashboard routes; measure performance on throttled mobile connections. The current build still warns about the main JS bundle size. |
| P2 | Broader mobile and accessibility audit | Review products, variants, inventory, discounts, media, order details and settings with long Bangla content, keyboard focus, error states, slow networks and the on-screen keyboard. |
| P3 | Useful help inside the workflow | Short product/publishing/dispatch guides and actionable errors. Avoid a separate empty help destination. |

## Mobile acceptance standard

- Check 360–390px phone widths, an intermediate width around 768px, and desktop.
- No page-level horizontal overflow; deliberately scrollable status tabs must remain discoverable.
- Preserve critical values on phones rather than simply hiding table columns.
- Use compact labelled actions, accessible icon names, 16px editable inputs and comfortable typing targets.
- Check both Bangla and English, long names/handles, empty and no-match results, loading, failed requests and retry states.
- Keep navigation focus and modal focus usable. A desktop viewport simulation does not substitute for testing a physical phone and its keyboard.

## Verification of the first batch

- Production build/type checks pass. Existing large-bundle warning remains.
- Dashboard tests: 14 passed.
- Landing-page API integration tests: 12 passed against `uddokta_test`, including publication/draft isolation and cross-store access checks.
- Browser checks cover the real development store's landing-page filters, empty results, reset, copy-link feedback, Home queue navigation, customer summaries and mobile navigation.
- Verified 360px and 390px phone layouts, a 768px tablet layout and the 1470px desktop layout. Checked document width for horizontal overflow on the landing-page list, and the 360px customer view. Saved screenshots in `design/review/`. The existing store already has an order, so the revised first-order onboarding branch was source-reviewed and built, not exercised end to end through a new store.
- No production deployment, competitor data changes, real courier booking, physical-device test or full newly-created campaign-to-delivery test was performed in this batch.

## Compact Orders layout refinement

The Orders screen now uses a compact heading, a single summary strip, and one integrated list toolbar. Search updates the URL after typing pauses; advanced status/source/date filters open in a dialog. Applied filters can be removed individually. Saved views and their management actions remain available in the toolbar rather than a separate card. Export and new-order actions stay in the heading.

Desktop rows are 44px tall with distinct order, date, customer, source, total, status and product columns. Phones use roughly 120px cards containing the same operational information. Phone numbers are omitted from both order-list layouts at the user's request; order details and phone search remain available. Tablet tables scroll within their own region without widening the page. The summary uses actual scoped order counts, with no invented trends or percentages.

Verified desktop, 768px tablet bounds, and 360/390px phone layouts, including Bangla. Checked live search, combined filters, removable chips, saved-view creation, Escape dismissal and restored focus. Production build and 14 dashboard tests pass. Temporary sample data was isolated in a separate local store and removed afterward. Preview screenshots in `design/review/orders-compact-*.png` use those sample orders. No production deployment or physical-device test was performed.
