# Uddokta product and launch QA review

Reviewed: 5 November 2026. Local development build; existing `editor-qa` store.

## Product understanding

Uddokta is a Bangla-first commerce platform for Bangladeshi Facebook sellers. Its central workflow is: add a product, publish a sales page, share it in an advertisement, collect a cash-on-delivery order, confirm it, and arrange delivery. Products, media, inventory, orders, customers, discounts, courier integration and reporting support that workflow.

The architecture fits this scope: React dashboard, Hono API and server-rendered storefront, PostgreSQL tenant isolation, shared section schemas and rendering, and server-calculated prices. Draft/published page separation, checkout retry protection and inventory transactions are valuable existing foundations. The app should launch around dependable COD selling before expanding into AI, messaging and broader marketing automation.

## Scope and verification

- Read project guidance, workspace structure, navigation, account flows, editor, order/customer lists, onboarding, page API, storefront rendering, and existing tests.
- Browser-reviewed Home, landing-page list/editor before the requested stop, orders, status filtering and reset, order details, products/search, customers/search, Billing, Tracking, and a public product page.
- Checked buyer delivery-area selection: the displayed total changed from ৳1,270 inside Dhaka to ৳1,330 outside Dhaka for the fixture product.
- Did not submit orders, book couriers, change credentials, deploy, or publish production content.
- All editor changes were reverted following the user's instruction. No editor design or behavior changes remain.
- Production build passes. Baseline full suite: API 87/87, storefront 22/22, dashboard 14/14. After storefront changes: storefront 23/23; dashboard 14/14. No API changes remain.
- Database tests initially could not connect inside the sandbox; they passed when run with local test-database access. Tests use `uddokta_test`, not the development store.
- No load test, production DNS/CDN validation, real courier booking, physical-device test, or external Facebook share-preview validation was performed. Pagination failure/race paths were reviewed in code; the browser fixture has only two orders, so multi-page behavior was not exercised there.

## Changes completed outside the editor

### Order and customer list reliability

Files: `apps/dashboard/src/pages/Orders.tsx`, `Customers.tsx`.

Previously, repeated Load more clicks could fetch the same offset multiple times. Rejections were uncaught, and an older pagination response could append records after a filter or store changed.

Now pagination has an immediate request lock, a disabled/loading button, a visible error and retry, and a generation check that ignores stale responses. Starting a new filter clears old records while the new data loads. Unmounting invalidates pending responses.

### Search state follows the URL

File: `apps/dashboard/src/use-url-search.ts`.

The search input previously initialized from the URL once. It now follows subsequent URL query changes, including navigation, while preserving the existing debounced search interaction.

### Storefront sharing metadata

Files: `apps/storefront/src/server.tsx`, `server.test.tsx`.

Public documents now emit Open Graph description when present, locale, type, and URL when a canonical URL is supplied. Product pages now supply a canonical URL and their first product image, including alt text and dimensions, for sharing. URLs exclude advertising query parameters. Products without images do not emit broken image metadata. A regression test covers escaped metadata, canonical URLs, query exclusion and the no-image case. No editor fields or settings were added.

## Findings still open

| Priority | Finding and evidence | Recommended action |
| --- | --- | --- |
| P1 | Onboarding's final publishing step links to `/settings/billing`; the browser shows an unbuilt placeholder. Some setup steps have no completion predicate, and the onboarding side panel always says the store is not open. See `pages/Home.tsx`. | Define the pilot's activation model. For a manually provisioned beta, remove the billing dependency and derive readiness from actual setup. For paid self-service launch, implement billing/activation first. |
| P1 | Inbox, AI salesman, marketing, follow-ups, offers, segments, online-store information pages, Payments, SMS and Billing are exposed through navigation but lead to placeholders. See `nav.ts`, `main.tsx`, `pages/Placeholder.tsx`. | Keep the initial navigation focused on working tools. Hide deferred destinations or label them clearly as unavailable before users click. Preserve direct routes if needed for internal development. |
| P1 | Page API invalidates old revisions on publish but not on unpublish. A stale editor can still attempt to publish with its old revision after another member unpublishes. Found by source inspection in `apps/api/src/pages.ts`; deliberately left unchanged under the editor constraint. | Track as a separate backend concurrency fix with a two-session regression test. |
| P1 | Browser pixels are implemented; the source explicitly defers server-side conversion events. See `apps/storefront/src/server.tsx`. | Make event verification part of pilot acceptance. Add Meta Conversions API with event deduplication after measuring the browser-only flow. Do not claim server-side tracking yet. |
| P2 | Dashboard build emits a roughly 710 KB JavaScript entry chunk and a bundle-size warning. Routes are imported eagerly in `main.tsx`. | Split heavy route modules, measure initial load on a throttled mobile connection, and retain useful loading/error states. |
| P2 | The selected fixture product has no photo or description. The public product page consequently lacks the visual and explanatory content a buyer needs. This is fixture content, not proof of a rendering defect. | Add a product-readiness checklist before advertising: image, price, availability, delivery charges, return terms and contact details. |
| P2 | At the browser’s intermediate width, the customer table compresses customer names and clips the final date column. Five fixed metadata widths compete with the customer column; the mobile collapse applies only below 40rem. See `Customers.tsx` and `.data-table` rules. | Add a customer-specific intermediate layout or a scrollable table region, with useful purchase/order summaries retained on phones. |
| P2 | Other list screens use similar asynchronous loading patterns. This pass fixed Orders and Customers only. | Audit Products, Media, Collections, Inventory and Discounts for duplicate pagination requests, stale responses, error recovery and store switching. |
| P2 | Several features rely on manual refresh, including courier status and domain checks, as documented in source comments. | State this clearly in the pilot. Add jobs when operational volume justifies them. |

## Design and UX assessment outside the editor

The neutral surfaces, green actions, Bangla labels and compact controls are a coherent base. The order detail groups product totals, next actions and customer contact information in a useful way. Keep that direction.

The greatest UX gain comes from reducing incomplete journeys, not adding decorative redesign:

1. Make onboarding accurately describe what is required to sell and show real completion state. A seller should reach a working page without encountering a billing dead end.
2. Reduce navigation to the launch scope. Clearly separate available functions from future capability.
3. Keep loading, empty, no-results and failure states distinct. Preserve a clear retry action. Do not silently show old records under a new filter.
4. Improve catalog readiness through helpful content checks rather than more dashboard cards.
5. Test the full seller workflow on a phone: long Bangla product names, status tabs, forms with validation errors, media selection, and keyboard opening. Browser viewport inspection does not replace real-device QA.
6. Add clear account recovery and support entry points before a broad self-service launch. They are not present in the inspected login/signup route flow.

## Minimum launch scope

Recommended launch: a small, manually supported COD pilot. Automated subscriptions, online payments and AI are not prerequisites for that scope.

| Required outcome | Current evidence | Acceptance gate |
| --- | --- | --- |
| Seller can sign in and access only their store | Membership checks and API tenant-isolation tests exist | Verify production session cookies, signup restrictions and a documented account-recovery/support process |
| Seller can create a sellable product | Product/variant/media/inventory implementation and tests exist | Test actual uploads, Bangla names, active/unlisted/draft states, sold-out behavior and price changes |
| Buyer receives the intended published page | Draft isolation and revision tests exist | Confirm deployed publish/update/unpublish, address changes and share links; preserve the editor UI |
| Buyer can place a COD order reliably | Checkout, stock, duplicate retry, receipt and pricing tests exist | Complete a deployed test order on inside/outside delivery areas; verify stock and order totals; retry submission |
| Seller can manage and dispatch orders | Order workflow and courier tests exist | Verify allowed status transitions, cancellation/restock and one real supported courier sandbox/test booking |
| Buyer knows delivery, returns and how to contact the seller | Content sections exist | Ensure real seller contact and policy content is present before advertisements begin |
| Advertising links and events work | Tracking settings/browser pixel code and metadata exist | Verify deployed share preview and purchase-event behavior on the chosen ad platform |
| Activation has no dead end | Billing remains a placeholder | Define manual pilot activation or finish the paid activation path |
| Operations can recover from failure | Deployment plan exists; production operations not verified in this pass | Verify backups and restore, uptime/error alerts, secrets, R2 uploads, DNS/TLS and rollback on the actual environment |

A green test suite supports a pilot; it is not a substitute for these deployed acceptance checks.

## Features to implement later

Near-term, after a stable pilot:

- Product CSV import/export and order export for daily operations.
- Bulk order actions with clear per-order failures.
- Order status history and staff audit records.
- Saved order filters and practical customer segments.
- Courier status synchronization and explicit booking-failure recovery.
- Verified domain status refresh and publish/cache invalidation once CDN caching is enabled.
- Server-side conversion tracking with browser/server event deduplication.
- A minimal support and account recovery flow; move this earlier for broad self-service launch.

After evidence of demand:

- Automated billing, plan limits and usage reporting.
- SMS/WhatsApp notifications and consent-aware follow-up flows.
- Additional couriers, online payments and reconciliation.
- Conversion reporting from visits to submitted/delivered orders, keeping analytics separate from order records.
- A/B testing only after reliable conversion measurement exists.
- Unified inbox and AI assistance after the core sales and support workflows are stable. The system must continue calculating prices and stock.

No editor redesign is proposed in this work following the user's correction.
