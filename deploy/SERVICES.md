# Railway beta service settings

Railway no longer permits new services to opt into legacy `railway.json`/`railway.toml` configuration. Configure the following service settings directly in Railway; the Dockerfiles remain version-controlled.

| Setting | admin | storefront | console |
|---|---|---|---|
| Source repository | developerhasan99/uddokta-app | same | same |
| Source branch | main | same | same |
| Root directory | repository root (blank) | same | same |
| Variable `RAILWAY_DOCKERFILE_PATH` | deploy/Dockerfile.admin | deploy/Dockerfile.storefront | deploy/Dockerfile.console |
| Start command | Dockerfile default | Dockerfile default | Dockerfile default |
| Pre-deploy command | node apps/api/src/migrate.ts | none | none |
| Healthcheck path | /_health | /_health | /_health |
| Restart policy | On Failure, 3 retries | same | same |
| Domain | admin.uddokta.co | *.uddokta.live | console.uddokta.co |

Use private `DATABASE_URL=${{Postgres.DATABASE_URL}}` references in all three services. Apply the rest of `production.env.example` as appropriate; never use the fake storage values from local container smoke tests. Keep credentials in Railway variables, not in this file.

Start the admin service first so migrations complete before the storefront becomes ready. Sign-up is open (`SIGNUP_MODE=open`) and storefronts are indexed (no `ROBOTS_NOINDEX`).

## Domains proxy (Fly.io)

Sellers' own domains go through a separate Caddy proxy, not Railway: Fly app `uddokta-domains` (personal org, region `sin`), dedicated IPv4 `37.16.26.111`, files in `deploy/proxy/`. Deploy with `cd deploy/proxy && fly deploy --app uddokta-domains --ha=false`. It needs no secrets. Caddy gets a certificate only for domains the storefront approves at `https://domains.uddokta.live/_domains/allowed`, so deploy storefront changes to that route before proxy changes that depend on them. The admin service needs `DOMAINS_IP=37.16.26.111` to show sellers the records.


## Console service

The platform console runs as its own service so it never shares a process, domain or cookie with the seller dashboard. Variables: `DATABASE_URL` (reference); the same `R2_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `MEDIA_PUBLIC_URL` as the admin service (Demos copies images; the service will not start in production without them); and for "Send reset link" the same `APP_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` as the admin service. It runs no migrations (the admin service does). Grant the first administrator from a Railway shell on the console service: `npm run admin -w console -- add <email of an existing account>`.
