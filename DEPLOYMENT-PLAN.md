# First hosted deployment plan

Prepared 4 November 2026. Status: deployment preparation underway. Railway project `Uddokta`, environment `beta`, and an isolated PostgreSQL service have been created. Domains have not been cut over.

## Agreed addresses

| Purpose | Address |
|---|---|
| Brand website, outside this deployment | `uddokta.studio` |
| Merchant dashboard and same-origin API | `admin.uddokta.studio` and `/api/*` |
| Default merchant storefronts | `{handle}.uddokta.live` |
| Campaign landing pages | `{handle}.uddokta.live/{page-handle}` |
| Products / collections | `/products/{handle}` and `/collections/{handle}` |
| Public product images, proposed | `media.uddokta.live` |

The first hosted environment is an invite-only beta for testing, using synthetic merchant/customer data. Do not open general registration or connect real ad pixels/courier booking credentials during initial smoke testing. Domain names are the agreed target addresses; their DNS configuration and availability for attachment still need verification. Sellers' own domains are planned below (Fly.io fixed-IP proxy).

## Hosting layout

One Railway project with a separate beta environment and these services:

1. **Admin/API**: builds the dashboard, serves its static production assets and React Router fallback, and handles `/api/*` in the same service. This avoids an extra frontend proxy and keeps login/CSRF on one origin.
2. **Storefront**: server-rendered merchant pages, product catalog, and COD checkout. Attach `*.uddokta.live` to this service. Resolve the merchant from the request host; unknown merchants return 404.
3. **PostgreSQL**: fresh beta database on private networking, shared by API and storefront. Do not migrate local customer records into it.

Cloudflare R2 stores images independently of application containers. No extra worker, Redis, or service is needed for the currently implemented request-driven flows. Background jobs can be deployed separately when implemented.

The source repository is already configured as `https://github.com/developerhasan99/uddokta-app.git`. Both application services must build from the workspace root, since they share workspace packages and the storefront imports API database/storage modules. Set explicit per-service start commands and retain the dependencies needed at runtime, including `tsx` for the storefront.

## Phase 1 — make the repository deployable

- Add explicit deployment configuration and reproducible builds for the two services. Pin and test the exact Node runtime used by the build/runtime images.
- Add production dashboard static serving to the API entry point. Serve hashed assets with long-lived immutable caching and HTML without immutable caching. Missing `/api/*` routes must remain JSON/API errors, not return dashboard HTML.
- Keep frontend API calls relative to `/api`. Replace hardcoded `uddokta.com` storefront links with a configurable public storefront domain (`uddokta.live` for beta). Build-time frontend values contain no secrets.
- Make the storefront use Railway's injected `PORT`, with local fallback behavior preserved. Bind both services on an externally reachable interface.
- Add unauthenticated health endpoints for Railway that do not require a merchant hostname. Verify database readiness separately; Railway deployment health checks use `healthcheck.railway.app`.
- Add a production migration script that reads injected environment variables without requiring a local `.env` file. The current `migrate` script uses `--env-file=.env`, which is unsuitable for the hosted container as written.
- Change public landing page GET/POST/confirmation routes to `/{handle}` and `/{handle}/thanks`. Keep dashboard/API editor endpoints unchanged.
- Redirect old GET `/pages/{handle}` URLs permanently to the new URL. Retain safe handling of old POST/thanks routes so existing checkout forms and receipts do not break during transition.
- Add a central reserved-path policy shared by API validation and storefront routing. Reserve catalog, checkout, media, API, health, robots/sitemap and other system routes; protect existing data from ambiguous handles.
- Update generated links, page-list URLs, field prefixes, tests and canonical links. Validate decoding, Bangla handles, unknown paths, and root store-home routing.
- Add a server-side beta access/registration policy so knowing the admin URL does not grant arbitrary sign-up or access to test data. Public test merchant pages must remain reachable for buyer checkout testing.
- Validate required environment variables at startup with useful errors and no secret values in logs.

Acceptance: clean installation, production build, full tests, a local production-mode smoke run using the same runtime and entry points as Railway, and a reviewable source revision ready for deployment.

## Phase 2 — prepare accounts, storage and secrets

Confirm the Railway workspace and a new project/environment destination. Confirm the existing Cloudflare account/R2 status and authoritative DNS provider for both domains. A domain registered at Hostinger can remain registered there even if DNS is moved later. Do not change nameservers unless necessary; preserve any existing website/email records.

Create a dedicated beta R2 bucket and bucket-scoped credentials, plus a public media custom domain. Cloudflare documents `r2.dev` as a development URL; use a custom domain for production-style media serving. Connecting that custom domain may require onboarding its DNS zone to Cloudflare; verify the current setup before deciding on any DNS move.

Environment variables:

| Variable | Services | Notes |
|---|---|---|
| `NODE_ENV=production` | Both | Secure cookies and production checks |
| `DATABASE_URL` | Both; migration job | Railway private Postgres reference; secret |
| `PORT` | Both | Injected by Railway |
| `STOREFRONT_DOMAIN=uddokta.live` | Storefront | Merchant hostname routing |
| Configurable frontend storefront domain | Admin build | Public value; exact variable added during implementation |
| `R2_ACCOUNT_ID`, `R2_BUCKET` | Both | Bucket configuration |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Both initially | Secret, restricted to the intended bucket; scope permissions to actual service needs |
| `MEDIA_PUBLIC_URL` | Both | Proposed `https://media.uddokta.live` |
| `COURIER_KEY` | API | Generate securely once and keep stable across deployments; encryption key |
| Beta access configuration | Admin/API | Exact mechanism selected during implementation |

Do not paste secrets into chat, commit `.env` files, or put secrets into frontend `VITE_*` variables. Runtime connections and migrations must retain the project's role-switch/RLS model. The migration connection needs to create/grant the restricted `uddokta_app` role; verify that permission on Railway before proceeding.

## Phase 3 — initial deployment and domains

1. Provision fresh Postgres, configure backups, and verify the connection and role-creation permissions.
2. Deploy the Admin/API service with a single pre-deploy migration command. The storefront must not independently run migrations. Verify migration failure blocks a release, rather than starting incompatible application code.
3. Deploy the storefront after schema readiness; verify health endpoints and service logs before attaching merchant traffic.
4. Attach `admin.uddokta.studio` to Admin/API and `*.uddokta.live` to storefront. Add the exact verification and routing records Railway supplies. Do not guess CNAME, TXT, or certificate-validation targets.
5. Attach the R2 media custom domain. Verify upload, public image access, correct content types, and image availability after redeployment.
6. Verify HTTPS, host-only Secure/HttpOnly session cookies, same-origin `/api` requests, CSRF enforcement, and correct host routing through Railway's proxy. Platform hostnames must not resolve to merchant content.
7. Keep the beta invite-only. Create test accounts/stores through the application; do not reuse production secrets or copy local session cookies.

Use Railway-generated temporary addresses for service readiness checks. Merchant pages additionally require a valid merchant host, so an arbitrary Railway hostname is not sufficient to test storefront routing.

## Phase 4 — release smoke test

- Dashboard deep links survive refresh; API errors stay API errors; assets load correctly.
- Login/logout work over HTTPS; unauthenticated access and unapproved beta sign-ups are refused.
- Create two stores and prove their products, images, pages and orders remain isolated.
- Upload an image, use it in a product/page, redeploy, and confirm it remains available.
- Publish a landing page at the short URL. Draft-only content/SEO/address edits leave the public version unchanged. Publish and unpublish work correctly.
- Legacy `/pages/` links work as planned; reserved/unknown paths return the correct result.
- Place COD orders using Bangla/English digits, variants and both delivery areas. Confirm totals in the dashboard.
- Retry the same checkout concurrently: one order, one stock adjustment, one coupon use. Confirm receipts ignore forged URL amounts and cannot cross stores.
- Cancel an order and verify stock restoration. Test sold-out and invalid-phone behavior.
- Inspect on real Android/iOS devices and mobile data; inspect errors and response times from Bangladesh.
- Restart/redeploy both services; repeat login, media, publish and checkout checks.
- Perform a backup/restore rehearsal on a separate disposable database before broader release.

## Sellers' own domains (approved November 4, 2026)

Goal: a seller adds two records at their registrar and nothing else: `A @ → <fixed IP>` and `A www → <fixed IP>`. No forwarding, no nameserver change. Budget agreed: up to $5–10 a month.

Why this design: Railway routes by Host and only knows our domains; Railway Pro allows 20 custom domains per service. Cloudflare Host-header override and apex proxying are Enterprise only. A fixed IPv4 is the only way to support the bare domain with one simple record, and neither Railway nor Cloudflare offers one within budget.

Layout (as built):

```
buyer → rinafashion.com or www.rinafashion.com → Fly.io fixed IPv4 37.16.26.111 → Caddy
        (on-demand Let's Encrypt certificate; Caddy first asks the storefront GET /_domains/allowed?domain=…)
      → https://domains.uddokta.live on Railway (matches the *.uddokta.live wildcard; "domains" is a reserved store handle)
        with Host and X-Forwarded-Host = domains.uddokta.live and X-Store-Host = the buyer's host
      → storefront middleware maps X-Store-Host to a store (www redirects 301 to the bare domain)
```

- Fly.io runs only this proxy (about $2/month for the IPv4 plus a small machine and a 1 GB volume for certificates). If it fails, `*.uddokta.live`, the dashboard and media keep working. Add a second machine for redundancy when sellers depend on it.
- `{handle}.uddokta.live` stays permanent, like myshopify.com. Once a seller domain is live, GET requests on the subdomain redirect (302) to it; form POSTs do not, so open checkouts keep working.
- The canonical host is the bare domain; `www` redirects to it. Both records point to the same IP.
- No shared secret between proxy and storefront (changed from the first draft): every storefront page is public, so a spoofed `X-Store-Host` shows nothing a buyer could not see on that domain. Add a secret before a CDN cache sits in front of the storefront (noted in `server.tsx`).

Build steps and status:
1. Done: spike (details below).
2. Done: database. One domain per store, so two columns on `stores` instead of a table: `domain` (unique, lowercase, format-checked, `www.` stripped) and `domain_live_at`. Existing `stores` row-level security applies: members read, owners/admins update. Migrations `0051_store_domain.sql` (columns) and `0052_store_domain_functions.sql` (`storefront_domain_store(host)` → handle, `storefront_live_domain(handle)` → domain once live; both SECURITY DEFINER, executable by `uddokta_app` only).
3. Done: API in `apps/api/src/domains.ts`, registered in `app.ts`: `GET /stores/:handle/domain` → `{ domain, liveAt, ip }`; `PUT` `{ domain }` (input is cleaned by `readDomain`: scheme, path, `www.` and case removed, Bangla domains to punycode, our own domains refused; errors `domainInvalid` 400, `domainTaken` 409, `forbidden` 403); `DELETE`; `POST …/domain/check` resolves both A records (`ok`/`missing`/`wrong`), then fetches `https://{domain}/_health`, and sets or clears `domain_live_at`. The proxy IP comes from env `DOMAINS_IP` on the admin service (not set yet on Railway: the check returns 503 `domainsUnavailable` until it is). No background re-check yet (ponytail note in code: add a pg-boss job). Tests: `apps/api/src/domains.test.ts` (5).
4. Done: storefront in `apps/storefront/src/server.tsx`: one middleware sets `handle` and `origin` for every request (skips `/_…` paths); canonical links use `origin`; `GET /_domains/allowed` for Caddy. Test: last test in `server.test.tsx`. Sitemap does not exist yet, so nothing to change there. Full suite: 124 tests passing.
5. Done: dashboard `apps/dashboard/src/pages/Domains.tsx` at Settings › Domains (route added in `main.tsx`, strings in `i18n.tsx` with `domain…` keys, styles `.steps` and `.domain-records…` in `styles/app.css`). Empty state with a domain field; after adding: the domain with a Live / Setup needed badge, numbered Bangla steps, the two A records (`@` and `www`, full hostnames shown) with copy buttons, per-record status after a check (Working / Not found yet / Points elsewhere), a note while https is being set up, "Check again", and remove with an inline confirmation. The check runs automatically when an owner or admin opens the page. Staff see the domain and status but no controls. If `DOMAINS_IP` is unset the page says the feature is coming soon. Checked in the browser on desktop and at 390 px wide (no sideways scroll; on phones the type column hides and the status badge sits under each record).
6. Done: `deploy/proxy/Caddyfile` is a catch-all `https://` site with on-demand TLS asking `https://domains.uddokta.live/_domains/allowed`, forwarding with `Host` and `X-Forwarded-Host: domains.uddokta.live` and `X-Store-Host: {host}`; `http://` redirects to https. Deployed to Fly (machine `683e763b156678`). Verified: an unclaimed domain gets no certificate (TLS handshake refused), HTTP redirects with 308, and `domains.uddokta.live` with `X-Store-Host: www.x` redirects to `https://x`. `DOMAINS_IP=37.16.26.111` added to the Railway admin service. The spike's test record `A shop.uddokta.studio` was deleted at Hostinger on November 4, 2026 (stores cannot claim our own domains, so it only showed a 404).
7. Done (November 4, 2026): ownership proof and main-address switch. Before this, the first store to type a domain held it, so anyone could squat a domain, and a domain a store removed but left pointed at the proxy could be claimed by another store and served with a certificate. Now claims are free and non-unique; a domain serves only once verified by a TXT record `_uddokta.{domain}` = `uddokta={store id}` (`stores.domain_verified_at`, unique among verified rows by partial index `stores_verified_domain`). The check reads the TXT records and, when this store's value is there, calls `release_stale_domain(host, found)` so a store whose value is gone loses the domain (the real DNS owner can move it); if both values are present the check answers 409 `domainTaken` and the seller deletes the old one. A missing TXT record on a later check un-verifies. `stores.domain_primary` (default true; `PATCH /stores/:handle/domain { primary }`) lets the seller keep uddokta.live as the main address: both addresses serve, no redirect. Migrations `0053_store_domain_verified.sql`, `0054_store_domain_verified_functions.sql` (domains live before this stay verified until their next check). The page was redone as one card: the domain with Live / Main address badges, last checked, https note, Open it, Check again, the main-address switch, remove (×), three records with copy buttons while setting up, and the always-working uddokta.live address at the bottom. Checked in the browser (setup and live states, switching main address).
8. Next: end-to-end test with a real seller domain. Create a store at `admin.uddokta.studio`, add the domain in Settings › Domains, add the two A records and the TXT record at the registrar, press Check again, confirm https on both names, the store page on the domain, the `www` redirect, the `uddokta.live` redirect once live, and a COD order placed on the domain.

Known limits (by design, revisit later): one domain per store; no background re-check (a domain that breaks stays live until someone opens the page); hostnames under a subdomain such as `shop.rina.com` work but the instructions say `@` and `www`; a second proxy machine for redundancy is not set up.

Spike files: `deploy/proxy/` (Dockerfile, Caddyfile, fly.toml). Spike passed on November 4, 2026: Fly app `uddokta-domains` (personal org, region `sin`; `bom` is no longer offered) with dedicated IPv4 `37.16.26.111` ($2/month), machine `683e763b156678`, volume `vol_r686967g32delzj4`. A second empty volume `vol_42kxnx2yxezde984`, left over from a capacity error, was deleted on November 4, 2026. Test record `A shop.uddokta.studio → 37.16.26.111` at Hostinger (user-approved). Results: Let's Encrypt certificate issued by Caddy, `/_health` 200 and the storefront's Bangla 404 page served through `server: Caddy` → `railway-hikari`, HTTP redirects to HTTPS. TLS setup took about 1.2–1.4 s from the test machine; Railway's US West region adds a Pacific round trip, so consider moving Railway to Singapore.

Later: let sellers buy a domain inside Uddokta so records are set automatically.

## Rollback and promotion

Record the exact source revision and deployed service versions. Keep migrations backward compatible where feasible. A code rollback does not undo a database migration; do not drop receipt/snapshot data to roll back. Restore only through a reviewed recovery procedure if necessary.

After the beta passes, prepare an isolated production environment with its own database, R2 bucket, keys, backup policy and access settings. Agree on domain cutover and handling/removal of synthetic beta data before routing real merchants. Broad launch still depends on the remaining product gates in `QA-REVIEW.md`, especially draft recovery, publishing preflight and account recovery.

## Remaining account setup

- Hostinger sign-in and the `uddokta.live` record comparison are complete.
- Public beta HTTPS routing (including temporary Railway URLs) and public media access were explicitly approved. Finish configuring them.
- Obtain confirmation for the exact Hostinger nameserver change before applying the cutover.

## References

- [Railway monorepos](https://docs.railway.com/deployments/monorepo)
- [Railway pre-deploy migrations](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway health checks](https://docs.railway.com/deployments/healthchecks)
- [Railway domains and wildcard configuration](https://docs.railway.com/networking/domains/working-with-domains)
- [Cloudflare R2 public buckets and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/)

## Implementation progress

- Railway project: `c161cef9-e5f2-4107-82bf-dc1c6b139b97` ([open beta](https://railway.com/project/c161cef9-e5f2-4107-82bf-dc1c6b139b97?environmentId=c078cf24-7e67-4761-9a62-9b67afda8aa0)).
- Beta environment: `c078cf24-7e67-4761-9a62-9b67afda8aa0`. Isolated Postgres is provisioned; no merchant data has been imported.
- R2 is activated. Private bucket `uddokta-beta-media` uses a bucket-scoped object read/write credential stored in both Railway services. The credential expires December 4, 2026 and must be rotated before then. No secrets are stored in this repository.
- Cloudflare Free zone `uddokta.live` is prepared with scanned apex A and www CNAME records. Bot Preference Sync was disabled with explicit approval. Hostinger's full record list was inspected and matches: apex A `2.57.91.91` (TTL 50), www CNAME `uddokta.live` (TTL 300). Cloudflare imported them with automatic TTL and proxy enabled; review proxy behavior before activation. Hostinger's DNSSEC page showed only the blank add-record form, with no existing DS entries displayed. Nameservers remain at Hostinger. Assigned Cloudflare nameservers: `malcolm.ns.cloudflare.com`, `rachel.ns.cloudflare.com`.
- Keep `uddokta.studio` DNS at Hostinger. Onboard `uddokta.live` to Cloudflare, preserve its existing records, then change nameservers only after verifying the copy. Reserve `media.uddokta.live` for R2.
- First beta signup is restricted to the user-provided email in `deploy/beta.env.example`. General registration is closed by default in production. `ROBOTS_NOINDEX=true` discourages indexing of beta storefronts.
- Added `deploy/Dockerfile.admin`, `deploy/Dockerfile.storefront`, and `deploy/SERVICES.md` with the per-service settings; keep the source root at the repository root. The live Railway dashboard and current documentation confirm that new services cannot use legacy Railway JSON configuration, so configure Dockerfile paths, health checks, and migration commands directly in service settings.
- Admin serves the dashboard build and same-origin API, provides readiness checks, and validates production configuration. Migrations run only in the admin service's pre-deploy command.
- Public campaign URLs now use `/{handle}`. Legacy GET links redirect, legacy checkout POSTs remain supported, and reserved existing handles retain their legacy URL until renamed. Generated links and canonical links use the new paths.
- Production merchant URLs default to `uddokta.live` and can be changed using `VITE_STOREFRONT_DOMAIN` at build time; storefront host routing uses `STOREFRONT_DOMAIN` at runtime.
- Verification: 118 regression tests passed. Both Docker images built from a clean Linux dependency installation. Admin container checks confirmed readiness 200, dashboard/deep-link HTML 200, and API errors remain JSON. The first storefront container test caught a JSX configuration issue when launched from the workspace root; its Dockerfile now explicitly selects the storefront tsconfig, and the corrected image passed its smoke checks.

- Source revision `967ae20` on `codex/railway-beta` is deployed to both Railway application services. Admin migrations completed and both applications report Online after readiness checks; Postgres is also Online.
- Admin service: `b6a329e9-34d0-4b5c-8ca6-b3152fedccd4`; storefront service: `3860adaf-9439-4ec0-9536-8882dac82516`.
- Public routing, media custom domain, backup policy, DNS cutover, and live browser QA remain incomplete. Admin temporary domain `https://admin-beta-ebcf.up.railway.app` was generated with target port 8080; it has not yet been checked in the app browser. Never use placeholder smoke-test storage credentials in Railway.

- November 4, 2026: `codex/railway-beta` was fast-forwarded into `main` (`ad97f20`), both Railway services now deploy from `main`, and the old branch was retired. Work directly on `main` while there are no real merchants.

## Resume checkpoint — November 4, 2026

We stopped during domain setup, after the first application deployment succeeded. This is a private beta deployment in progress, not a completed public launch.

1. Re-read this file and `deploy/SERVICES.md`, inspect the current Git status, then re-check Railway's current service/deployment state. Railway deploys from `main`; work happens on `main` only during the beta. Local deployment-status documentation changes have not been committed yet.
2. Finish adding `admin.uddokta.studio` to the admin service, port 8080. The UI was left in the custom-domain form with that hostname entered; port selection was not confirmed. Read fresh UI state before continuing. Obtain Railway's actual DNS record(s), then add them to the existing Hostinger `uddokta.studio` zone. Existing studio sites/subdomains must be preserved.
3. Attach `*.uddokta.live` to the storefront and obtain the actual Railway routing and certificate-verification records. A temporary storefront Railway domain may also be generated; its hostname alone cannot identify a merchant. Confirm the storefront restart-policy update to three retries completed successfully.
4. Prepare the Cloudflare DNS records for the storefront without overwriting the apex/www records unintentionally. The full Hostinger zone comparison is complete. Ask for the exact nameserver cutover confirmation, then replace only the live domain's nameservers with `malcolm.ns.cloudflare.com` and `rachel.ns.cloudflare.com`. Leave studio nameservers at Hostinger.
5. Once the live zone is active, connect the R2 bucket to `media.uddokta.live` and verify public image delivery. User already approved public media read access and public beta HTTPS routing; do not ask for the same approval again unless scope changes. Keep credentials private and the development r2.dev URL disabled unless needed and approved.
6. Verify HTTPS and the live login page. Let the user create their password/account using `developerhasan99@gmail.com`; do not enter a new password for them. Test signup restrictions, session cookies, login/logout, page-editor save/publish, short merchant URLs, uploads, COD checkout, receipts, tenant isolation, and mobile layout. No end-to-end live QA has been completed yet.
7. Railway's Backups page says creating backups, automated schedules, and point-in-time recovery require Pro; no backup was configured or upgrade purchased. Agree on an alternative backup/restore process or an authorized plan upgrade before broader release.
8. Rotate the 30-day R2 credential before December 4, 2026, update both services, and verify uploads. Do not create a reminder unless requested.

### Progress, November 4, 2026 (second session)

- `admin.uddokta.studio` is attached to the admin service on port 8080. Railway asks for these records in the Hostinger `uddokta.studio` zone (no existing `admin` records): CNAME `admin` → `xtzhzsn6.up.railway.app`; TXT `_railway-verify.admin` → `railway-verify=1ecf1487eb2477d31ce0832bba433dcf8f783312d991ef358fd558907792f84c`. Added with user approval. `https://admin.uddokta.studio` is live: health 200, deep links return dashboard HTML, unknown `/api/*` returns JSON 401.
- `*.uddokta.live` is attached to the storefront on port 8080. Records added to the Cloudflare `uddokta.live` zone, all DNS-only (grey cloud) so Railway can issue the wildcard certificate: CNAME `*` → `ekor3bbb.up.railway.app`; CNAME `_acme-challenge` → `ekor3bbb.authorize.railwaydns.net`; TXT `_railway-verify` → `railway-verify=ef75dfa4c163a6935247cbd5e6c02b1ab59e6711e0e71a61866163551b58be5c`. Apex A and www CNAME untouched.
- With user approval, `uddokta.live` nameservers at Hostinger were changed to `malcolm.ns.cloudflare.com` / `rachel.ns.cloudflare.com` (studio unchanged). At the end of the session the `.live` registry still served the old Hostinger nameservers; wait for propagation (up to 24h), then confirm the Cloudflare zone is Active and the Railway wildcard certificate is issued.
- Why `uddokta.live` is on Cloudflare: an R2 custom domain (`media.uddokta.live`) only works on a zone in the same Cloudflare account, and storefront CDN caching, purge-on-publish and later Cloudflare for SaaS custom domains need it too. The studio zone only needs one CNAME, so it stays at Hostinger.
- Storefront restart policy confirmed: On Failure, 3 retries.
- Cloudflare zone `uddokta.live` is Active; Cloudflare and Google resolvers see the new nameservers. Railway still showed the wildcard as "Waiting for DNS update" at last check; traffic reaches Railway but served its `*.up.railway.app` certificate until verification completes.
- With fresh user approval, R2 bucket `uddokta-beta-media` is connected to `media.uddokta.live` (HTTPS works; missing objects return 404). The r2.dev URL stays disabled. `media` is a reserved store handle. Storefront has `MEDIA_PUBLIC_URL` set.
- Local inspection: `npm run db:studio` opens Drizzle Studio on the local database only. Inspect beta data in Railway's Postgres Database tab.
- Cloudflare redirect rule "Root and www to uddokta.studio": `uddokta.live` and `www.uddokta.live` (any path, http or https) → 302 `https://uddokta.studio`. Temporary on purpose so the apex can be reused later. The apex A / www CNAME records stay proxied; they only exist so the rule can run.
- Railway issued the `*.uddokta.live` certificate (expires Feb 2, 2027; Railway renews). Storefront `/_health` is 200 on merchant hosts, unknown and reserved store hosts return 404, `robots.txt` disallows all.
- Next: live QA (step 6). The user signs up first at `https://admin.uddokta.studio`.

Cloud account tabs may need signing in again when resuming. Secrets are already stored in Railway; do not request or paste them into chat. Re-check dashboard values rather than relying on old UI element IDs. Preserve the user's public-access approvals recorded above.

## Scope cut (November 4, 2026)

Removed at the user's request: Analytics › Expenses, the Team section (Team home, Tasks, Attendance) and Settings › Refer and earn. Pages, API routes (`team.ts`, the `/expenses` routes), tests and copy are gone; migration `0055_remove_expenses_team.sql` drops the `expenses`, `tasks` and `shifts` tables (beta data is synthetic). Profit is now delivered sales − buying price. Settings › Team and permissions stays.

## Public launch (November 5, 2026)

The user decided to drop the beta: anyone can sign up and use the app. Repo: `deploy/beta.env.example` is now `deploy/production.env.example` with `SIGNUP_MODE=open` and no `ROBOTS_NOINDEX`; the sign-up-closed message no longer mentions a beta. The allowlist and closed modes stay in code to restrict sign-up again if needed.

Railway (done by the user, admin service and storefront variables): set `SIGNUP_MODE=open`, delete `SIGNUP_EMAIL_ALLOWLIST`, delete `ROBOTS_NOINDEX` on the storefront. Turn on Postgres backups before real sellers' orders arrive.

Known gaps for a public app: no password reset (there is no email provider), no sign-up rate limit, no email verification, no billing (everything is free), courier booking only for Steadfast and untested with a real account.

## Orders page and mobile sizing (November 6, 2026)

Orders now uses the shared `PageHeader` (title, one-line description, Export and New order), status tabs with counts across the top of the list (replacing the four-stat overview strip; the status chip is gone because the tab shows it), and the buyer's phone under the name in rows and phone cards. Mobile sizing fixed at the root: the global 40rem rule no longer makes `.btn` 44px or body text 16px. Buttons stay 32px/13px; inputs and selects are 36px with 16px text (no iPhone zoom). The per-page patches that undid the old rule (pages, campaign dialog, planned features, orders, saved views) are removed. CLAUDE.md updated to match.

Follow-up (same day): saved views are now tabs after the status tabs, not a dropdown with a "⋯" menu. A view tab is active when the URL's filters match it exactly; the active one has × to remove it. "Save view" appears in the applied-filters row only when there are filters to save (anything besides status). Search (13rem) and Filters sit at the right of the tab row; zero counts are hidden. "Update view" is gone: save a new view instead. Unused view strings removed.

## One data table, bulk actions, one value per cell (November 6, 2026)

Every list uses `.data-list` + `.filter-bar` + `.data-table` (rules in the comment at the top of the table CSS). The old `.table` and orders-only table styles are gone; Members and Incomplete use `data-table--stack` (label/value rows on phones). "Load more" sits in the list's footer everywhere; Media's search moved into its list card.
Row selection lives in `components/Selection.tsx` (`useSelection`, `SelectAllCell`, `SelectCell`, `BulkBar`, `BulkDelete`). Bulk actions: Orders › change status (the database still decides which moves are allowed), Products › delete (owners and admins), Media › delete (files in use are refused and stay selected). Each runs the existing per-item endpoint in parallel; add a bulk endpoint if sellers select hundreds. Bulk actions were checked in the UI only, not run against dev data.
Desktop cells hold one value: phone, address, email and page link have their own columns (Orders, Customers, Incomplete, Team, Landing pages); phones still stack them.
Landing pages: sort moved into the filter bar after search; the page count is in the list footer (no second toolbar row). Fixed cells overflowing where the Customers and Landing pages tables switch to block layout.
Media: file type tabs (All, JPG, PNG, WebP…) in the list's filter bar, only for types the store has, with counts. API: `GET /media?format=` filters by original format (missing format counts as WebP) and returns `formats` counts; tested.

## New order form with several products (November 6, 2026)

Migration `0058_multi_item_orders.sql`: `place_order_lines(store, page, lines jsonb, …)` prices up to 20 lines (same variant merged), applies the coupon to the whole subtotal, and takes stock from one warehouse that holds every tracked line (refusing the whole order otherwise). `place_order` keeps its signature and calls it with one line, so storefront checkout is unchanged. `POST /orders` takes `items: [{ variantId, quantity }]` (a lone `variantId`/`quantity` still works). Tested: pricing, merged lines, all-or-nothing stock, cancel restoring every line, bad input.
Form: product lines (picker for several at once, variant choice, stock hint, − / + stepper, line total, remove), Payment card (subtotal, inside/outside switch with each charge, coupon behind "Add coupon", amount to collect), customer card with the phone first: a known number shows their order record (amber if they returned any) and fills name and address when empty. Browser-tested; a test order #1002 was created in the dev store.
New order: "Find a past customer" search (name or number, keyboard and mouse) at the top of the Customer card; picking one fills the order and shows a summary with their record, Edit and Remove. New customers still use the fields. Uses the existing customers endpoint.

## Order tags (November 6, 2026)

Migration `0059_order_tags.sql`: `orders.tags text[]` (max 10, checked in the database; each tag up to 50 characters, trimmed and de-duplicated by `readTags`). Set on the new-order form and on the order page (saves run in sequence so quick edits never overwrite each other), with the store's existing tags suggested (`GET /order-tags`). The orders table shows Tags in place of Products; clicking a tag applies the new `tag` filter (exact match, part of the shared filter contract, so it works in saved views and CSV export, which also gained a Tags column). Search also matches tags. Phone cards no longer show the phone under the name (CLAUDE.md rule). Tested in the API and the browser.
Tag filter takes several tags (comma-separated `tag`, up to 10; orders must have all of them). Clicking a tag in the table adds or removes it; each tag is its own chip; the Filters dialog has a Tags field with suggestions. Tested in the API and the browser.

## Order page upgrade (November 6, 2026)

Header: status (plus repeat/blocked) badges, the next step as the primary button, other steps in a menu (cancel asks first), Print (print stylesheet shows only the order), newer/older order arrows. Meta line: placed time, source, warehouse. Products with images (linked to the product), variant pill, unit × qty and line total; summary with discount, delivery area and a cash-on-delivery state (due / collected / not collected, derived from status). Courier card with an empty state for each status, tracking code with copy. Customer card with call / WhatsApp / copy icons and an edit form for name, number and address until the order is packed (API refuses after with 409 `orderLocked`; the delivery area is not editable because it changes the charge). Delivery record: success rate from this number's delivered vs returned orders in the store, counts, "Risky" under 60%. API: items carry `productId`/`thumbUrl`, the order carries `newer`/`older`. Tested in the API and the browser.
Not built (needs new tables): an activity log with comments, and a cross-courier fraud check (our record covers this store only).
