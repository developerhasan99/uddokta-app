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

The first hosted environment is an invite-only beta for testing, using synthetic merchant/customer data. Do not open general registration or connect real ad pixels/courier booking credentials during initial smoke testing. Domain names are the agreed target addresses; their DNS configuration and availability for attachment still need verification. Merchant-owned custom domains are a later feature.

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

## Rollback and promotion

Record the exact source revision and deployed service versions. Keep migrations backward compatible where feasible. A code rollback does not undo a database migration; do not drop receipt/snapshot data to roll back. Restore only through a reviewed recovery procedure if necessary.

After the beta passes, prepare an isolated production environment with its own database, R2 bucket, keys, backup policy and access settings. Agree on domain cutover and handling/removal of synthetic beta data before routing real merchants. Broad launch still depends on the remaining product gates in `QA-REVIEW.md`, especially draft recovery, publishing preflight and account recovery.

## Account details still needed

- Railway workspace/project destination and authorization to connect the repository.
- Cloudflare account and R2 bucket readiness.
- Current authoritative DNS provider and existing records for both domains.
- Testers who should be allowed into the first beta.

## References

- [Railway monorepos](https://docs.railway.com/deployments/monorepo)
- [Railway pre-deploy migrations](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway health checks](https://docs.railway.com/deployments/healthchecks)
- [Railway domains and wildcard configuration](https://docs.railway.com/networking/domains/working-with-domains)
- [Cloudflare R2 public buckets and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/)

## Implementation progress

- Railway project: `c161cef9-e5f2-4107-82bf-dc1c6b139b97` ([open beta](https://railway.com/project/c161cef9-e5f2-4107-82bf-dc1c6b139b97?environmentId=c078cf24-7e67-4761-9a62-9b67afda8aa0)).
- Beta environment: `c078cf24-7e67-4761-9a62-9b67afda8aa0`. Isolated Postgres is provisioned; no merchant data has been imported.
- Cloudflare account exists; R2 activation is being completed by the user because it accepts subscription terms. DNS is currently managed by Hostinger.
- Keep `uddokta.studio` DNS at Hostinger. Onboard `uddokta.live` to Cloudflare, preserve its existing records, then change nameservers only after verifying the copy. Reserve `media.uddokta.live` for R2.
- First beta signup is restricted to the user-provided email in `deploy/beta.env.example`. General registration is closed by default in production. `ROBOTS_NOINDEX=true` discourages indexing of beta storefronts.
- Added `deploy/Dockerfile.admin`, `deploy/Dockerfile.storefront`, and `deploy/SERVICES.md` with the per-service settings; keep the source root at the repository root. The live Railway dashboard and current documentation confirm that new services cannot use legacy Railway JSON configuration, so configure Dockerfile paths, health checks, and migration commands directly in service settings.
- Admin serves the dashboard build and same-origin API, provides readiness checks, and validates production configuration. Migrations run only in the admin service's pre-deploy command.
- Public campaign URLs now use `/{handle}`. Legacy GET links redirect, legacy checkout POSTs remain supported, and reserved existing handles retain their legacy URL until renamed. Generated links and canonical links use the new paths.
- Production merchant URLs default to `uddokta.live` and can be changed using `VITE_STOREFRONT_DOMAIN` at build time; storefront host routing uses `STOREFRONT_DOMAIN` at runtime.
- Verification: 118 regression tests passed. Both Docker images built from a clean Linux dependency installation. Admin container checks confirmed readiness 200, dashboard/deep-link HTML 200, and API errors remain JSON. The first storefront container test caught a JSX configuration issue when launched from the workspace root; its Dockerfile now explicitly selects the storefront tsconfig, and the corrected image is being verified.

Cloud resource changes still require completing R2 activation/credentials, connecting the tested source branch, setting service variables, and verifying the DNS records before cutover. Never use placeholder smoke-test storage credentials in Railway.
