# WinningSeller: Application Analysis

Analysed 1 Nov 2026 from the logged-in owner account of the store "Scent Haven" (Starter plan, not yet paid or published).

**How this was gathered:** read-only walk through the dashboard, storefront and marketing site, plus network requests and the route table in the public JS bundle.

**Evidence labels:** everything is observed unless marked *(inferred)*. The store is almost empty (1 product, 1 test order), so populated states and most write endpoints were not seen.

---

## 1. What it is

A Bangla-first, all-in-one commerce SaaS for Bangladeshi Facebook sellers who sell by cash on delivery. It combines a store and landing-page builder with order operations, courier booking, fraud prevention, a phone sales CRM, ad tracking and profit accounting.

**Positioning:** "from online shop to the whole business, in one place", with no separate tools, bills or logins.

**The main differentiators are shaped by the local market:**

| Differentiator | Local problem it answers |
|---|---|
| Fake-order protection and courier records | Unpaid COD returns cost the seller courier fees both ways |
| One-click booking with 6 local couriers | Copying details into courier panels by hand |
| Repeat-sales call lists | Ad money spent on buyers who are never contacted again |
| Server-side ad events | Pixel events lost to iPhones and browser blockers |
| Profit on delivered orders only | Sellers guess at real margin after ads and returns |
| Smart paste of Messenger/WhatsApp orders | Orders arrive as free-text chat messages |

### Business model

| Revenue line | Details |
|---|---|
| Subscription | Building is free; a plan is required to publish. Starter: ৳99 first month, then ৳499/month |
| Lifetime deals | Offered; 100% refund within 7 days. Prices not seen |
| AI credit packs | 5 for ৳149 (1 month), 15 for ৳399 (1 month), 40 for ৳999 (3 months) |
| Platform SMS | ৳0.58 per SMS if the seller has no SMS company account |
| AI moderator | "With the plan, a little per message", through Buy or Block |

**Starter limits:** 100 products, 300 orders/month (never refused, only an upgrade prompt), 2 staff besides the owner, 3 landing pages, 1 AI credit/month.

**Affiliate programme:** 50% on monthly and yearly plans, 30% on lifetime deals. Renewals earn for 12 months, 60-day attribution, 14-day hold, ৳1,000 minimum withdrawal to bKash, Nagad or bank.

---

## 2. System structure

```
winningseller.com                     Marketing site (Bangla)
app.winningseller.com                 Seller dashboard (SPA) + REST API at /api/v1/
app.winningseller.com/platform/*      Platform staff admin (routes seen in bundle, not visited)
{handle}.shop.winningseller.com       Tenant storefront (server-rendered)
yourshop.com, www.yourshop.com        Optional custom domains (2 per store)
```

### Technical observations

| Area | Observed | Inference |
|---|---|---|
| Frontend | SPA with hashed `/assets/name-hash.js` files, a `vendor` chunk and about 50+ lazy page chunks; main bundle about 326 KB | Vite build. React is likely but not confirmed |
| Languages | Bangla, English, Chinese; language files load as separate chunks | Custom or lazy-loaded i18n |
| API | REST under `/api/v1/`, trailing slashes on collections, page-number pagination | Possibly Django/DRF; unconfirmed |
| Storefront | HTML pages with inline scripts only, section classes such as `sec-hero`, `Cache-Control: private, no-store`, `X-Frame-Options: DENY` | Server-side templates, separate from the SPA |
| Realtime | `GET /live/pulse` and count endpoints; attendance board "refreshes every minute" | Polling, not WebSockets |
| PWA | `manifest.webmanifest`, `/push/status`, browser notifications and sound | Installable, with web push |
| Background work | Hourly courier status checks, delayed SMS, payment timeouts, 90-day data deletion | A job queue and scheduler |
| Secrets | UI says courier and tracking tokens are stored encrypted and never shown again | Not independently verified |
| AI | "AI (Gemini)" named on the Salesman page; photo-to-product, AI design, AI landing pages | Metered by credits via `/ai/status` |
| Analytics | Google Analytics and Microsoft Clarity load in the seller dashboard | Sessions in the dashboard are recorded by the platform |

**Multi-tenancy** *(inferred)*: each account belongs to one store, resolved from the session on the dashboard and from the hostname on the storefront. Internal IDs (order 488, page 342, warehouse 175) are separate from the per-store order number (#1001), which suggests shared tables with sequential IDs.

---

## 3. Sitemap and routes

### Dashboard sidebar

| Group | Item | Route | Purpose |
|---|---|---|---|
| Main | Dashboard | `/` | 6-step setup guide; later today's sales and orders |
| | Orders | `/orders` | Main order list |
| | Incomplete orders | `/incomplete-orders` | Abandoned checkouts and duplicates |
| | Stop fake orders | `/fake-orders` | Protection rules, stopped orders, block list |
| | Customers | `/customers` | Customer book |
| | Repeat sales | `/calls` | Daily call queue |
| | Chat inbox | `/inbox` | Buyer chats and leads |
| | AI moderator | `/ai-moderator` | Social-channel AI sales (Buy or Block) |
| | All guides | `/help` | 38 in-app guides |
| Products & stock | Products | `/products` | Catalogue |
| | Categories | `/categories` | Groups and store menu order |
| | Coupons | `/coupons` | Discount codes |
| | Stock requests | `/restock` | Back-in-stock waitlist |
| | Warehouses | `/warehouses` | Locations and low stock |
| | Suppliers | `/suppliers` | Payables and advances |
| | Purchase orders | `/purchase-orders` | Stock buying |
| Your shop | Pages & landing | `/pages` | Home page and landing pages |
| | Design | `/design` | Theme system |
| Setup | Couriers | `/couriers` | Courier accounts and record checks |
| | Online payments | `/payments` | bKash, SSLCommerz |
| | SMS | `/sms` | SMS provider and templates |
| | Tracking | `/tracking` | Meta, TikTok, Google, Clarity |
| | Settings | `/settings` | Store, delivery, domain, team |
| Team | Tasks & follow-ups | `/tasks` | To-do list |
| | Attendance & shifts | `/attendance` | Staff clock-in |
| Money | Accounts | `/accounts` | Profit and loss |
| | Billing | `/billing` | Plan, usage, credits |
| | Promote & Earn | `/promote` | Affiliate programme |

The sidebar also has the store name, a View store link, a "How do I…?" help button, a language switcher and log out. Help icons next to items explain each feature.

### Routes not in the sidebar

| Area | Routes |
|---|---|
| Orders | `orders/new`, `orders/:orderId` |
| Products | `products/new`, `products/ai`, `products/import`, `products/:productId` |
| Stock and buying | `warehouses/ledger`, `suppliers/:supplierId`, `purchase-orders/new`, `purchase-orders/:orderId`, `purchase-orders/:orderId/edit` |
| Calls | `calls/offers`, `calls/automations`, `calls/report`, `calls/manage`, `customers/:customerId` |
| Team | `attendance/shifts`, `attendance/report` |
| Chat | `inbox/salesman` |
| Design | `pages/:pageId/edit`, `design/chrome` |
| Printing | `print`, `print-po` |
| Other | `publish`, `r`, `r/:storeId` |
| Auth | `signup`, `signup/complete`, `verify-email`, `forgot-password`, `reset-password`, `invite`, `buy` |

### Platform admin (route names only, not visited)

`platform`, `stores`, `payments`, `plans`, `settings`, `ai`, `sms`, `landing`, `ai-credits`, `email` (notifications, campaigns, unsubscribes), `blog` (posts, categories), `affiliates`, `followups` (tasks, messages, settings), `staff`.

These show the operator also runs email campaigns, a blog, and its own follow-up of sellers.

### Storefront routes

`/`, `/products/`, `/products/:slug/`, `/search/`, `/checkout/`, `/publish`, `/pay/ipn/sslcommerz/`.

---

## 4. Module breakdown

### 4.1 Onboarding and dashboard

Six steps with a progress bar: first product → logo → pick a design → delivery charges → place a test order → publish. The next step is highlighted as "Do this now", and support phone/WhatsApp is visible throughout.

- Signup creates the store website immediately.
- The test order is a deliberate activation step: "Test passed! The order came through."
- Coach marks give first-visit tips on screens.
- Until paid, a top banner shows "Starter (Monthly) is still waiting for payment", and the storefront shows a publish prompt.

### 4.2 Orders

**List**
- Status tabs with counts: All, New, On hold, Confirmed, Packed, With courier, Delivered, Returned, Cancelled.
- Search by order number, mobile, name or article.
- Filters: courier, courier status, tag, source (website, landing page, typed by team, AI chat), payment (paid, advance paid, due, check payment), test or real.
- Actions: Live indicator, notifications, sound, Download CSV, New order, Manage tags, row-level Block, and bulk selection for courier sending.
- Columns: order, customer, items, total, area, status, courier, time.

**Order detail**
- Header actions: Edit order, Invoice, Parcel label, Send SMS, Block.
- Panels: products and totals, timeline with notes, Next step (Confirm, Put on hold, Cancel order), tags, courier, customer (copy, call, WhatsApp, address, delivery area).
- Risk panels: history of this number and courier record.
- Attribution: "Where it came from" shows `fbc`, `fbp` and `landing_url`.

**New order (`/orders/new`)**
- **Smart paste:** paste a whole chat message, and name, phone, address and product fill in (Bangla, English and Bangla digits).
- Delivery area with an optional agreed charge, discount, coupon (calculated on the server), and advance received by bKash, Nagad or Rocket.
- Source: Messenger, WhatsApp, phone call, Facebook comment, Instagram, at the shop, other.
- The summary shows "Courier collects", and a tick marks the order as already confirmed.

**Order lifecycle**

```
New ──> Confirmed ──> Packed ──> With courier ──> Delivered
 │         │                         │
 └> On hold└──> Cancelled            └──> Returned (stock restored)
```

Courier sub-status: waiting for pickup, picked up, on the way, on hold, delivered, partly delivered, returned, cancelled by courier, unknown.

The exact transitions are *(inferred)*; only the actions on a New order were seen. Test orders cannot be sent to a courier.

### 4.3 Incomplete orders and duplicates

- Captures a buyer once they type a valid phone number, along with whatever they type next.
- Tabs: To call, All, Ordered, Dropped. Data is deleted after 90 days.
- Duplicates: two orders from one number for the same product within 24 hours are both marked, never refused.
- Has a "Check any number" tool, backed by `/fraud/public-checker/link`.

### 4.4 Fake-order protection

**Protection levels** set the rules in one click: Light (stops only robots, otherwise warns), Medium (suggested), Strict.

| Rule | Behaviour |
|---|---|
| Low courier record, with a minimum parcel count | Delivery charge must be paid online first |
| Very bad record (at least 3 parcels) | No online order; buyer is told to call |
| Velocity limits | Per number per day; per phone or browser per hour; cancelled orders excluded |
| SMS code | 4-digit code for numbers that are new to the shop and have a poor or missing record |
| Cross-shop warning | Shows "Returned X parcels at other shops", never naming the shop; warning only |
| Always on | Invalid prefixes (only 013–019 allowed) and robot orders sent within seconds |

- **Block list:** by number or IP. Blocked buyers only see "please call"; they are not told they are blocked. The guide warns that IP blocks can hit shared mobile IPs.
- **Metrics:** stopped this month, paid delivery first, estimated return cost saved.
- **Data sources:** Steadfast buyer score, Pathao rating, Fraud BD API key, checked once per number per 24 hours.

### 4.5 Customers and levels

- Groups: All, Bought once, Buy again and again, Quiet for a while, Many returns/cancels.
- Each customer has a level (one step per purchase), a last-bought date and an Add to calls action. The profile page holds the full history.

### 4.6 Repeat sales (call centre)

The most distinctive module. It generates call lists automatically so that no one has to remember who to phone.

```
Order ─> "New orders" list: agent confirms by phone
Delivered ─> customer is Level 1
7 days later ─> joins "Repeat sales" list automatically
Agent calls with an offer and notes the conversation
  ├─ Sale: Level +1, sale credited to the agent
  ├─ "Call later": returns on the promised date
  └─ No answer: retries up to a limit
Next delivery ─> the cycle repeats
```

| Screen | Contents |
|---|---|
| Who to call today | New orders and Repeat sales queues, calling one by one with a detail pane; own daily calls and sales |
| Offers | One-line script, optional product, price, free delivery, audience (everyone, previous buyers, non-buyers), end date |
| Auto follow-ups | Thanks (1 day), buy again (20 days), quiet (45 days), left the form (30 minutes), festival greeting on a chosen day. Editable text with an SMS count |
| Report | Phone sales by month, on the way, returned, profit, customer ladder, per-agent results; a sale can be reassigned or removed |
| Teams and rules | Teams with one of two jobs (confirm orders, sell to past buyers), one team per person; rules for offer delay, maximum tries, retry hours, days after "will think" |

### 4.7 Chat inbox and Salesman

**Inbox:** filters for Open, Done and All, plus lead status: Not answered, Answered, Talked to them, Could not reach. Unknown questions appear in red at the top.

**Salesman (`/inbox/salesman`):**
- Chat widget on/off, auto-answer, optional name and phone collection before chatting.
- Two modes: "From your notes" (free) or "AI (Gemini)", falling back to notes if Gemini fails. AI is not yet enabled for this store.
- Settings: name, first line, up to 6 ready questions, a fallback reply, tone instructions, a knowledge base and a test box.
- **AI ordering:** the AI collects the details, but the system calculates all prices and totals. Only the buyer's "yes" places an order. Optional human review, plus limits on order value and piece count.
- Facebook Messenger connection is marked "Coming soon", pending Facebook's approval.

### 4.8 AI moderator (Buy or Block)

Separate from the Salesman: an external product connected through a linked account (`/crm/status`). It handles Messenger, WhatsApp and Instagram, reads products live, understands photos and voice notes, takes orders and syncs contacts to a CRM. It needs a paid plan. The connect link must be used within 30 minutes.

### 4.9 Products and catalogue

**List:** tabs for All, Active, Draft, Deleted; filters for category and stock; sorting by date, name, price and stock.

**Editor:**
- Name, article number, rich-text description, images, YouTube "real video".
- Variant options (for example Size: M, L, XL).
- Selling, old and buying price (buying price visible to owners and admins only), SKU, stock tracking.
- "Hide the price, take orders by phone" replaces order buttons with Call to order.
- Package offers (for example 1 for ৳590, 2 for ৳990), status, categories, link and Google search settings.

**Other tools:**
- **AI product:** 1–4 photos produce a name, description, variants and suggested price, using a credit.
- **Import:** Shopify, WooCommerce, Wix, Facebook catalogue, another WinningSeller shop, CSV or Excel up to 10 MB. Shows a preview first and never changes existing products. CSV export is available.
- **Categories:** order controls the store menu.
- **Coupons:** global on/off switch, codes, free delivery, monthly report.
- **Stock requests:** "Notify me" box on sold-out products, with waiting and notified lists and optional automatic SMS.

### 4.10 Inventory and purchasing

- **Warehouses:** default warehouse created automatically; website stock is the sum of all. Low-stock threshold per warehouse.
- **Stock ledger:** every movement, by type: Sold, Returned, Order cancelled, Purchased, Transferred in or out, Correction.
- **Suppliers:** amount owed, advances paid, open purchase orders, archiving.
- **Purchase orders:** Draft → Ordered → Partly received → Received, or Cancelled. Pressing "Goods arrived" updates three things at once: stock, the supplier's ledger and the accounts.

### 4.11 Pages and page builder

- **Pages:** the home page and landing pages, with Visit, Copy link and Customise. "AI landing page in 5 minutes" is also offered.
- **Editor (`/pages/:pageId/edit`):** three panes: section list, live preview, section settings.
- **Section controls:** drag, move up or down, hide, duplicate, remove, Add section.
- **Page controls:** undo/redo, desktop/mobile preview, Page settings, Save draft, Publish.
- **Default home page sections:** Hero banner, Trust badges, Categories, Product grid, Promo banner. Marketing claims 24 ready-made sections, including video, reviews, countdown, FAQ and order form.

### 4.12 Design system

A token-driven theme with a live preview.

- **AI design:** a one-line brief and optional photo set colours, fonts and home page copy.
- **Brand setup checklist:** logo, shop icon, colours (from the logo), share picture, social links, contact details.
- **16 one-click styles:** Target, Apple, Amazon, eBay, Alibaba, Fresh, Launch, Luxe, Harvest, Herbal, Runway, Circuit, Bloom, Confetti, Hearth, Glow.
- **7 product page layouts:** Classic, Focus, Marketplace, Deal, Wholesale, Clean, Story.
- **7 product cards:** Flat, Bordered, Shadow, List, Deal tile, Quick add, Boutique.
- **Colour tokens** (about 30): buttons, prices and badges, text, backgrounds, header and menu, footer, messages.
- **Typography:** 12 font options including Bangla web fonts, plus size, weight and letter spacing.
- **Shape and layout:** corners for buttons, cards and inputs; page width; products per row; image fit; discount badge; sticky mobile order button; on-page order form; cart on/off.
- **Text:** button labels, delivery time, return policy.
- **Header, menu and footer (`/design/chrome`):** 3 header layouts, toggles for search, call, WhatsApp, cart and announcement bar; a custom menu and button; footer columns; optional left sidebar.

### 4.13 Storefront and checkout

- Bangla by default, showing Bangla numerals in prices.
- Product cards offer "Order now" and "Add to cart"; product pages can embed the order form.
- Checkout takes COD by default, with online payment if configured, and delivery area charges.
- The chat widget and the corner WhatsApp/Messenger/call button are optional, and the corner button is hidden on checkout and payment pages.
- Checkout feeds incomplete-order capture and all the protection rules.

### 4.14 Integrations

| Category | Providers | Notes |
|---|---|---|
| Couriers | Steadfast, Pathao, RedX, Carrybee, Paperfly, eCourier | Each card has credentials, Test connection, pickup store, default courier, invoice prefix, status sync; some have a sandbox |
| Payments | bKash Tokenized Checkout, SSLCommerz (bKash, Nagad, Rocket, cards, banks) | Money goes to the seller's merchant account. Full amount, delivery charge or fixed advance; optional COD; 15–1440 minute payment window |
| SMS | BulkSMSBD, Alpha SMS, MiM SMS, SMSinBD, or the platform's account | Sender ID, daily limit, per-event templates with `{name}`, `{order_no}`, `{total}`, `{shop}`, `{tracking_link}`, `{courier}`, `{article}`; shows the segment count (Bangla 70 characters, English 160) |
| Ads and analytics | Meta Pixel + Conversions API, TikTok Pixel + Events API, GA4, Google Ads, Tag Manager, Clarity | Shared event IDs, SHA-256 hashed customer data, event log and test events; Google has one-click connect |
| Fraud | Fraud BD, Steadfast, Pathao | RedX deliberately excluded, as it offers no such API |
| AI | Gemini, Buy or Block | |
| Migration | Shopify, WooCommerce, Wix, Facebook catalogue | File-based import |

**Purchase event timing** is a key setting. Purchase is sent on confirmation (recommended), on order placement, or on delivery. Each order is sent once, and orders cancelled or returned by the send time are never sent. This stops fake orders from training the ad algorithm.

### 4.15 Settings

Store details and language, store link (3 changes per 30 days), slogan, WhatsApp, opening hours, social links, chat button, Buy or Block, delivery areas and charges, custom domain with suggestions, order tags (30 at most), team and device approval.

### 4.16 Team and permissions

| Role | Known access |
|---|---|
| Owner | Everything; sign-in is never held for approval |
| Admin | Can see cost prices and profit |
| Manager | Exists; exact scope not seen |
| Staff | Confirms and sends orders; never sees buying prices or profit |

- Invitations are links, valid for 7 days, shared by WhatsApp.
- **New-device approval:** an optional setting that makes staff wait for the owner's approval on a new device, showing name, device and IP. Approved devices can be revoked.
- **Tasks:** My or Everyone's, Open or Finished; "call me later" feeds in automatically.
- **Attendance:** Start and Finish work once a day, recording time and IP (no GPS or photos). Shifts, grace minutes, daily board, monthly report.

### 4.17 Accounts

- **Tabs:** Overview, Income & expenses, Profit by product, Courier accounts, Settings. Only the first two were read.
- **Period:** Today, 7 days, this month, last month, this year, custom.
- **KPIs:** net profit, income, costs, ROAS, delivered orders, return rate, ad cost per order, owed to suppliers.
- **P&L logic:** sales count delivered orders only. Costs are buying price, courier delivery fees, COD fees, return charges, and recorded expenses.
- **Expenses:** category (Facebook ads, other ads, product purchase, own delivery, packaging, salaries, rent, utilities, software, other), payment method, ad platform, campaign, note, receipt photo.
- **Attribution:** platform from `fbclid`, `gclid`, `ttclid`, otherwise `utm_source`. Campaign spend matches orders by `utm_campaign`.

### 4.18 Help system

A contextual "How do I…?" panel on every screen, using the same 38 guides as `/help`, grouped into Getting started, Products and pages, Orders and delivery, Customers and team, Shop settings and marketing, and Money. Human support by phone or WhatsApp appears on many pages.

---

## 5. API surface observed

All are under `/api/v1/`. These are the GET calls seen, except where noted. Write endpoints were not exercised.

**Loaded on every page:** `auth/me`, `live/pulse`, `site/analytics`, `billing/`, `onboarding/state`, `calls/due-count`, `inbox/waiting`, `incomplete-orders/open-count`, `tasks/due-count`, `team/devices/pending-count`, `push/status`.

| Domain | Endpoints |
|---|---|
| Orders | `orders/`, `orders/counts`, `orders/tags`, `orders/:id` |
| Incomplete | `incomplete-orders/`, `incomplete-orders/counts` |
| Fraud | `fraud/guard`, `fraud/guard/stats`, `fraud/settings`, `fraud/duplicates/count`, `fraud/public-checker/link`, `fraud/orders`, `fraud/flags`, `fraud/orders/:id`, `fraud/orders/:id/risk`, `fraud/orders/:id/block-state` |
| Couriers | `couriers/ready`, `choices`, `providers`, `accounts`, `attention`, `shipments`, `shipments/recent`, `orders/:id` |
| Customers | `customers/`, `customers/tags`, `customers/groups` |
| Calls | `calls/tasks`, `calls/tasks/counts`, `calls/settings`, `calls/sales/summary`, `calls/sales/by-order/:id` |
| Chat and AI | `inbox/conversations`, `assistant/settings`, `crm/status`, `ai/status`, `ai-landing/status` |
| Catalogue | `products/`, `categories/`, `coupons/`, `coupons/settings`, `coupons/report`, `restock/`, `restock/settings` |
| Stock | `warehouses/`, `warehouses/low-stock` |
| Purchasing | `purchasing/suppliers`, `purchasing/suppliers/summary`, `purchasing/purchase-orders` |
| Store | `store/`, `store/handle`, `shipping-zones/`, `domains/`, `pages/`, `design/theme`, `design/preview` (POST) |
| Setup | `payments/overview`, `payments/orders/:id`, `sms/overview`, `sms/messages`, `tracking/settings`, `tracking/events` |
| Team | `team/`, `team/devices`, `tasks/`, `attendance/me`, `attendance/me/month`, `attendance/board`, `attendance/members` |
| Money | `accounting/report`, `accounting/online-payments`, `usage/`, `affiliates/me` |

---

## 6. Inferred data model

```
Store ─┬─ Users (role) ── Devices, Attendance, Shifts, Tasks
       ├─ Products ── Variants, Package offers, Categories
       │     └─ Stock per Warehouse ── Stock ledger entries
       ├─ Customers (level, tags) ── Call tasks, Call sales
       ├─ Orders ─┬─ Items, Tags, Timeline, Attribution (fbc, fbp, UTM)
       │          ├─ Shipments (courier account)
       │          ├─ Payments
       │          └─ Fraud checks
       ├─ Incomplete orders, Block list, Restock requests, Coupons, Offers
       ├─ Conversations ── Messages, Salesman notes
       ├─ Suppliers ── Purchase orders, Supplier ledger
       ├─ Pages ── Sections (JSON, draft and published)
       ├─ Theme, Domains, Shipping zones
       ├─ Integration accounts (couriers, payments, SMS, tracking; encrypted)
       ├─ SMS messages, Tracking events
       ├─ Income and expense entries
       └─ Subscription, AI credit packs, Payments

Affiliate ── Referrals ── Commissions ── Withdrawals
```

Cross-shop return history implies a phone-number record shared across tenants.

---

## 7. End-to-end flow

```
Facebook ad (UTM, fbclid) ─> Landing page or product page
  │  phone typed ─> incomplete order captured
  ▼
Checkout ─> protection rules ─┬─ Blocked: "please call"
  │                           ├─ SMS code or pay delivery charge first
  ▼                           └─ Pass
Order: New ─> SMS, risk check, duplicate check, call task
  ▼
Agent confirms ─> Purchase sent to Meta / TikTok / Google
  ▼
Packed ─> one-click courier booking ─> invoice and label ─> consignment number
  ▼
Courier webhook, or hourly check
  ├─ Delivered: profit recorded, customer level up, thank-you SMS, offer call in 7 days
  └─ Returned: stock restored, return charges booked, return rate updated
```

---

## 8. Findings

### Defects

1. **Unrendered placeholder:** `{{crm}} opens in a new tab` appears on `/ai-moderator` and `/settings`.
2. **Marketing is behind the product:** the site says 3 couriers, 7 designs and 3 product layouts. The app has 6, 16 and 7.
3. **Guides conflict with billing:** guides describe a "free trial", while Billing says building is free and payment comes at publishing.
4. **SMS copy:** "any of these three" companies appears above a list of four.
5. **Inconsistent labels:** attendance is "End work" in the guide and "Finish work" on the screen.
6. **Example ID looks real:** the Clarity help text uses `ys1rxlbyfx` as its sample, the same ID the dashboard itself loads. A seller copying it could send their data into the platform's Clarity project.
7. **Seed data ignores language:** the default warehouse and order tags stay in Bangla in the English interface.

### Things to check

- `live/pulse` returned 503 on some page transitions; the cause wasn't established.
- Clarity runs on a dashboard showing customer phone numbers and addresses. Check that those fields are masked, as they are personal data.
- `platform/*` route names ship in the public bundle. That is harmless only if the server enforces permissions, which was not tested.
- The incomplete-order capture stores what buyers typed but never submitted. Check it against the privacy policy.

### Why the design works

- **Plain language throughout:** "Stop fake orders", not "fraud rules". Screens explain money impact in the seller's terms.
- **Safe defaults:** rules ship with presets, SMS templates are off, imports preview first.
- **Modules feed each other:** a single "Goods arrived" or courier update changes stock, money and customer level together.
- **The system calculates money, not the AI:** AI can never set a price.

---

## 9. Coverage limits

**Read:** all sidebar routes, order detail, new order, new product, AI product, import, call sub-pages, Salesman, header and footer, shifts, stock ledger, page editor, storefront home and marketing site.

**Not visited:**
- `/platform/*`: staff admin, outside this account's scope.
- `/publish`, `/buy`: payment flow.
- Auth pages, print views, `attendance/report`, supplier and purchase order detail, product edit, customer profile.
- Checkout and product pages on the storefront.
- Accounts tabs Profit by product, Courier accounts and Settings.

**Not tested:** any write action, role-limited views as non-owner, higher plans, populated data states, or server-side security.

**No store data was changed intentionally.** Opening `/design` made the app send its own `POST /design/preview`, and the page editor was opened without saving. The visits may appear in the store's analytics.
