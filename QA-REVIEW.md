# Uddokta product and launch review

Reviewed 4 November 2026. Scope: repository architecture and feature implementation, local browser QA, landing page editor improvements, and launch prioritization. This is a local engineering review; production infrastructure, real courier credentials, real ad accounts, and real devices were not exercised.

## Product understanding

Uddokta is a Bangla-first commerce SaaS for Bangladeshi sellers acquiring customers through Facebook and taking cash-on-delivery orders. The core loop is: add a product → create a campaign page → publish its link → take an order → confirm and fulfill it → book a courier → track delivery and profitability.

The long-term product includes a catalog storefront, inventory across warehouses, customers, discounts, incomplete checkouts, fraud protection, repeat-sales calls, analytics, and team operations. Inbox, AI sales, marketing automation, and several settings destinations remain placeholders. Landing pages can be the initial product without finishing every broader SaaS feature.

The architecture is well suited to this scope: React/Vite dashboard, Hono API, Postgres/Drizzle with tenant row-level security, and server-rendered React storefront. The editor and published page use the same section components. Order amounts and stock changes are enforced in the database. Images have ownership checks and reference tracking.

## Work completed

- Replaced the editor's heavy black toolbar with a thin neutral toolbar and subtle dividers.
- Reduced desktop side panels to 240px and 300px, leaving more room for the canvas.
- Replaced two-line section rows with compact icon-and-label rows; headings remain available in tooltips.
- Added a section count and a persistent page-settings entry in the section navigator.
- Added bilingual section-library search and an explicit no-results state.
- Collapsed benefit, review, FAQ, and gallery item settings into compact disclosures. Adding an item opens it immediately. Added downward movement for repeatable items.
- Replaced large section-action buttons with labeled icon controls in a bottom action row.
- Added saved/unsaved/saving status and corrected the save message for unpublished pages.
- Added save/discard/cancel when leaving through the editor's back link. Browser unload warnings remain in place. A failed save keeps the editor open.
- Serialized save/publish operations and paused edits and undo/redo during requests, preventing a response from replacing edits made while it was in flight.
- Added a visible warning linking to order forms with no selected product or a draft product. This is guidance, not a server-side publish gate.
- Publishing now requires the editor's revision, rejects stale revisions with 409, and advances the revision after publication. Added regression coverage and updated existing callers.
- Prevented form submissions from navigating the preview iframe, and added its viewport metadata.
- Tightened the phone toolbar and preserved the one-pane-at-a-time workflow. Closing settings returns to the section navigator.
- Corrected an existing collection test assertion that omitted the handle returned by the options API.

No new dependencies or database migrations were introduced. API and dashboard must be deployed together because publishing now requires a revision in its request body.

## Verification

### Automated

`npm test`: **107 passed** — 75 API, 18 storefront, 14 dashboard tests. Coverage includes tenancy boundaries, page draft/public separation, stale saves and publishes, media ownership, stock adjustments, order pricing, coupons, blocked phones, and courier behavior against a stand-in.

`npm run build`: passes API and storefront type checking and the dashboard production build. The build still warns about a dashboard JavaScript chunk of approximately 710 kB before gzip; route-level code splitting is a follow-up performance improvement.

### Browser

Used an isolated local `editor-qa` store. Existing merchant stores were not modified.

| Flow | Observed result |
|---|---|
| Login and new store | QA account signed in and store created |
| New campaign page | Created starter layout and opened editor |
| Product setup | Created an active product priced at ৳1,200 with 10 units |
| Repeatable content | Edited a benefit, saved, left, reopened, and saw the saved content |
| Leave protection | Save/discard/cancel dialog appeared; save-and-exit returned to the list |
| Section library | English search `gallery` found the gallery section in the Bangla UI |
| Product picker | Selected QA product; order form rendered in preview |
| Publish | Saved pending content and published; live link appeared |
| Public page | Published content and product form rendered on the local store domain |
| COD checkout | Outside-Dhaka delivery changed total from ৳1,270 to ৳1,330 |
| Order submission | Returned order #1001 with total ৳1,330 |
| Merchant order list | Displayed #1001, QA Buyer, the correct product, and ৳1,330 |
| Desktop editor | Reviewed at 1440×960 |
| Phone editor | Reviewed at 390×844; no document-level horizontal overflow |
| Phone list editing | New benefit opened immediately; undo and redo restored the correct state |
| Phone navigation | Selecting a section opened settings; closing returned to the section list |

Screenshots: [desktop](qa-artifacts/editor-desktop.png), [phone](qa-artifacts/editor-mobile.png).

Browser QA was focused on the landing-page sales loop. Courier booking, media upload/crop, warehouse administration, analytics, and every order-status transition were covered by existing automated tests and code review rather than a complete manual browser regression. Safari, Firefox, physical Android/iOS, assistive technology, slow-network behavior, and production load still need release testing.

## Remaining findings, ordered by launch impact

| Priority | Finding and evidence | Recommended acceptance criterion |
|---|---|---|
| P1 | Page metadata is not a published snapshot. `apps/api/src/pages.ts` saves title, handle, and SEO fields immediately; public reads use those fields. A saved URL change can move an already-live page before Publish. `hasChanges` compares section JSON only. | Version public metadata with content; saving never changes the live URL/SEO, and publishing clearly reports metadata-only changes. Add an old-URL redirect when an address changes. |
| P1 | Checkout has no durable idempotency key in `apps/storefront/src/server.tsx` or its form. Duplicate detection marks a repeated order; it does not stop a double submission from consuming stock twice. | Retrying the same checkout submission returns the original order and takes stock only once, including concurrent retries. |
| P1 | The thank-you page trusts `order` and `total` query parameters and uses them to generate the purchase pixel. A manually changed URL can display a fabricated amount or generate a purchase event. | Resolve confirmation and tracking from a signed/opaque order receipt; refreshing should not generate duplicate purchase events. Never expose buyer data through a guessable order number. |
| P1 | Unsaved draft recovery is incomplete. The new prompt covers the editor back link and unload warnings cover full navigation, but browser history navigation within the SPA and browser crashes do not have durable recovery. | Add a recovery draft scoped to account/store/page and revision, plus navigation blocking that includes browser Back. A conflict must preserve both copies rather than silently overwrite. |
| P1 | An incomplete order form can still be published. The new warning catches missing and draft product selections but does not validate every launch condition, including all-out-of-stock products and failed product loads. | For sales pages, show a preflight checklist with an actionable error per affected section; distinguish intentional informational pages. Enforce required checks at the API boundary. |
| P1 | Production readiness is not demonstrated by this local run. Custom-domain lookup and CDN invalidation are explicitly deferred in storefront/page code. | Prove managed Postgres backups and restore, R2 persistence, HTTPS store subdomains, secrets, health checks, error monitoring, and correct publish/unpublish behavior on the deployed environment. Custom domains can wait if hosted subdomains are reliable. |
| P2 | Onboarding promises a six-step launch but theme/delivery/plan steps have no completion checks, and the final step routes to placeholder billing (`Home.tsx`). | Use a landing-page-specific launch checklist whose steps actually complete, and remove unsupported billing gates during a controlled beta. |
| P2 | Sidebar exposes unfinished areas: Inbox/AI, Marketing, Segments, and several settings pages are placeholders (`main.tsx`, `nav.ts`). | Hide unfinished areas for the beta or label them clearly before navigation. The primary sales loop should have no dead ends. |
| P2 | The preview shares rendering but not the storefront's interactive page script. Dynamic totals and countdowns are not fully representative in the editor. | Explicitly separate editing and interactive preview modes; verify totals/countdowns in an isolated preview that cannot submit orders. |
| P2 | Same-type sections are hard to distinguish in a dense tree. Tooltips help on desktop but are weak on touch devices. | Allow a short private section name, or show an unobtrusive occurrence number and selected section breadcrumb. |
| P2 | Dashboard eagerly bundles the editor and other routes. Production build warns about the main JS chunk. | Lazy-load the editor and large routes; measure first load on a slow mobile connection before choosing a performance budget. |
| P2 | There is no self-service password recovery flow in the auth UI. | Provide a tested recovery flow or a documented, secure support recovery process before inviting paying users. |

P1 means resolve before a broad public release. P2 can be handled during a small supervised beta if support and expectations are clear.

## Bare minimum to ship the landing-page product

1. Account/store access and tenant separation; a secure account recovery route.
2. Product name, price, variants and availability; media upload and reusable image picking.
3. A small section library: hero, text/image, benefits, genuine reviews, FAQ, contact, and a product-linked order form. Countdown and gallery are optional.
4. Mobile preview, reordering, hide/show, duplicate/delete, undo/redo, reliable draft saving, lost-edit recovery, and clear conflict handling.
5. Publish/unpublish with hosted HTTPS URLs, public metadata snapshots, and a clear live/draft distinction.
6. COD checkout with Bangla/English phone digits, quantity/variant/stock validation, delivery charges, retry protection, and a trustworthy confirmation receipt.
7. Seller order list/detail, confirmation/cancellation, and verified stock restoration. One courier integration or a clear manual fulfillment workflow is enough initially.
8. Honest launch guidance and customer-facing delivery/return/contact information. Starter review and delivery claims must be replaced or hidden before publishing.
9. Ad tracking verified against genuine orders if campaigns are part of the launch promise. A custom social-share image is a valuable next addition.
10. Production backups, monitoring, durable uploads, deployment rollback, a support contact, and a completed release smoke test.

The existing product implements much of the commercial loop. Passing local tests is not a production release sign-off; the P1 findings above are the remaining release gates.

## Design direction and subsequent features

Keep the three permanent desktop regions: section tree, canvas, and inspector. Keep the canvas dominant, use narrow rows and thin rules, and reveal complexity only when the seller asks for it. Use the same typography, fields, focus treatment, and action placement across products, pages, and settings.

Next editor iteration: section naming, focused settings groups, keyboard movement, insert-between controls, an interactive preview toggle, and an accessible keyboard/focus audit. Avoid giving every section a large box or exposing dozens of arbitrary style controls.

After the launch gates: a few useful Bangla campaign templates; recovery/version history and restore; page duplication in the list (the API already supports it); reusable sections; share image and link preview; richer section layout controls; page-level conversion analytics and UTM attribution; server-side ad events with deduplication; custom domains; scheduled publishing; then experiments/A-B testing once traffic makes results meaningful.

Broader platform work can follow seller demand: Pathao, courier reconciliation, notifications, abandoned-checkout follow-ups with appropriate preferences, customer segments, repeat-sales workflows, and bulk operations. AI copy assistance and AI sales should follow reliable publishing and fulfillment rather than delay this release.
