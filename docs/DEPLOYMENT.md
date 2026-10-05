# Deploying DevPulse

One server, one command, HTTPS included. The stack in `docker-compose.prod.yml`:

```
Internet ──443──> Caddy (TLS, automatic certificates)
                    └─> nginx (serves the React build, proxies /api/ and the WebSocket)
                          └─> FastAPI ──> PostgreSQL
                                    └──> Redis <── alert worker
```

Only ports 80 and 443 are published. PostgreSQL and Redis are reachable solely from other containers.

## What has and has not been verified

Docker was not available where this was prepared, so be clear about what you are trusting:

| Verified by running it | Not verified until your first deploy |
|---|---|
| The production dependency set (no dev packages) boots the API, the worker and Alembic | `docker build` of both production images |
| `alembic upgrade head` on an empty database, and `alembic check` (models match migrations) | The wiring in `docker-compose.prod.yml` (service names, `migrate` ordering, healthchecks) |
| The exact `nginx.conf`: SPA fallback, asset caching, `/api/` proxying, WebSocket upgrade through the proxy | Caddy obtaining a certificate on a real domain |
| JWTs are absent from the API and nginx logs | Behaviour on your particular VPS |

CI builds both images on every push, which will catch Dockerfile mistakes before you deploy.

## 1. Try it on your own machine first

```bash
cp .env.prod.example .env.prod        # DOMAIN=localhost is already the default
# generate and paste real values for every CHANGE_ME:
python -c "import secrets; print(secrets.token_urlsafe(48))"

docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
curl -k https://localhost/api/v1/health/db        # {"status":"healthy","database":"connected"}
```

Open https://localhost (accept the self-signed certificate warning). The `migrate` service should show as `exited (0)`, which is correct: it is a one-shot job.

## 2. Put it on a server

1. **A small Linux VPS** with Docker and the Compose plugin installed (any provider; 1 GB RAM is enough to try it, 2 GB is comfortable for the image builds).
2. **A domain** with an `A` record pointing at the server's IP. Caddy cannot issue a certificate until DNS resolves.
3. **Firewall:** allow 22, 80 and 443 only. Example with ufw: `ufw allow OpenSSH && ufw allow 80 && ufw allow 443/tcp && ufw allow 443/udp && ufw enable`.
4. Clone the repository, create `.env.prod` from the example, set `DOMAIN=your.domain` and `CORS_ORIGINS=https://your.domain`, and fill every `CHANGE_ME` with a generated secret.
5. Start it:
   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
   ```
6. Register your account in the browser. New accounts are `ENGINEER`, so promote yourself:
   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml exec postgres \
     psql -U devpulse -d devpulse -c "UPDATE users SET role='ADMIN' WHERE email='you@example.com';"
   ```
   Sign out and back in so the new role is in your token.
7. Point a monitor at `https://your.domain/api/v1/alerts/ingest` with the `X-API-Key` header set to your `ALERT_INGEST_API_KEY`.

Do **not** run `scripts/seed.py` against a real deployment: it creates accounts with a publicly documented password.

## Everyday operations

```bash
C="docker compose --env-file .env.prod -f docker-compose.prod.yml"

$C logs -f backend worker          # follow API and worker logs
$C ps                              # health at a glance
git pull && $C up -d --build       # update; the migrate job re-runs on a rebuilt image
$C run --rm migrate                # run migrations by hand
```

**Backup and restore** (do this before anything risky, and put it on a cron job):

```bash
$C exec -T postgres pg_dump -U devpulse devpulse | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-2026-01-01.sql.gz | $C exec -T postgres psql -U devpulse devpulse
```

Redis runs with `--appendonly yes`, so alerts that were queued but not yet processed survive a restart.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `migrate` exits non-zero | Wrong `POSTGRES_PASSWORD`, or the volume was created earlier with a different password (`docker compose down -v` wipes it, which also deletes your data) |
| Browser shows 502 | Backend not healthy yet or crashed: `$C logs backend` |
| No certificate / browser warning on a real domain | DNS not pointing at the server yet, or port 80/443 blocked by a firewall |
| "Offline, retrying" next to the live indicator | WebSocket blocked. Check `$C logs frontend` and that nothing in front of Caddy strips the `Upgrade` header |
| Alerts accepted but no incidents appear | The worker is not running: `$C logs worker` |

## Security notes

- Secrets live only in `.env.prod`, which is not committed. Rotating `SECRET_KEY` logs everyone out.
- The WebSocket token travels in the URL. The app and nginx redact it from their logs, but a different proxy in front would not, so keep log levels in mind if you add one.
- There is no login rate limiting. If the instance is public, put it behind Cloudflare or add a limit at the proxy before sharing the link widely.

## Managed platforms instead of a VPS

Render, Railway and Fly.io can all run the same images. You need four things from any of them: a web service for the backend image, a **separate background worker** running `python -m app.workers.alert_worker`, managed PostgreSQL and Redis, and WebSocket support. Run `alembic upgrade head` as a release or pre-deploy command. Free-tier limits and pricing change often, so check their current terms before relying on one for a demo you will show employers (a database that expires or a service that sleeps makes a poor first impression).
