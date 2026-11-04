# Railway beta service settings

Railway no longer permits new services to opt into legacy `railway.json`/`railway.toml` configuration. Configure the following service settings directly in Railway; the Dockerfiles remain version-controlled.

| Setting | admin | storefront |
|---|---|---|
| Source repository | developerhasan99/uddokta-app | same |
| Source branch | main | same |
| Root directory | repository root (blank) | same |
| Variable `RAILWAY_DOCKERFILE_PATH` | deploy/Dockerfile.admin | deploy/Dockerfile.storefront |
| Start command | Dockerfile default | Dockerfile default |
| Pre-deploy command | node apps/api/src/migrate.ts | none |
| Healthcheck path | /_health | /_health |
| Restart policy | On Failure, 3 retries | same |
| Domain | admin.uddokta.studio | *.uddokta.live |

Use private `DATABASE_URL=${{Postgres.DATABASE_URL}}` references in both services. Apply the rest of `beta.env.example` as appropriate; never use the fake storage values from local container smoke tests. Keep credentials in Railway variables, not in this file.

Start the admin service first so migrations complete before the storefront becomes ready. Keep the beta access allowlist active and `ROBOTS_NOINDEX=true` on the storefront.
