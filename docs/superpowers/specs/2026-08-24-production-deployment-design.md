# Production Deployment

## Overview

AnimeVerse has no production deployment target. CLAUDE.md flags this directly: the old GitHub Pages workflow is gone, `ci.yml` only lints/builds/tests with no deploy step, and a real host is still needed before the app is reachable outside local dev. This plan closes that gap at $0/month recurring cost, using the app's existing Docker images and Compose setup almost unchanged.

The driving constraint is cost, confirmed explicitly by the user: $0/month is a hard line, not a preference. That rules out every fully-managed compute option (Render, Railway, Fly.io) once a second constraint is added: no cold starts, on either the API or the background worker. Covering both with an always-on paid instance runs ~$14/mo, and no free tier of a request-driven PaaS can keep a non-request-driven worker warm without either exceeding its free instance-hour budget or leaving queue messages stuck until the next external ping happens to land (see "Alternatives Considered").

## Goals

- $0/month recurring hosting cost.
- No spin-down/cold-start behavior on `api` or `consumer`: both stay running continuously.
- Reuse the existing Dockerfile and `compose.yml` service definitions with minimal changes; no rewrite of how the app is built or run.
- Automatic deploy on push to `main`, matching the zero-effort deploy experience a PaaS would have given for free.

## Non-Goals

- **No horizontal scaling or high availability.** Single VPS, single point of failure. The same trade-off local dev already makes, just now internet-facing. Not worth designing around at portfolio scale.
- **No custom domain.** A free DuckDNS subdomain is accepted in place of the "free subdomain from the platform" a PaaS would have given automatically (see "Domain & TLS": a bare VPS has no subdomain of its own).
- **No production-grade monitoring or alerting.** Docker's `restart: unless-stopped` is the only safety net, same as local dev.
- **No change to `ci.yml`'s `e2e` job.** It continues to boot its own throwaway backend and test against that, exactly as it does today. It does not run against the production deployment.
- **No change to application code, schema, or business logic.** This is infrastructure only.

## Alternatives Considered

- **Assemble free managed services (Render/Supabase/Upstash/CloudAMQP) for everything.** Rejected once cold starts were ruled out: `consumer.ts` holds a persistent RabbitMQ connection and reacts to queue messages, not HTTP requests. On any scale-to-zero platform, nothing wakes it when a message actually arrives; only an external ping wakes it, on the ping's own schedule, unrelated to when work shows up. That's a correctness gap, not a latency one.
- **Pay for one always-on instance (~$14/mo: Render Starter web service + Starter background worker, confirmed at $7/mo each).** Solves cold starts cleanly and was the recommended option, but fails the user's explicit $0/month hard line.
- **Fly.io end-to-end.** Set aside earlier in brainstorming: Fly's managed-Postgres offering is being phased out, so Postgres/Redis/RabbitMQ would all end up as self-run containers on Fly anyway. More ops than the managed-services option for no real savings over the VPS option below.

## Architecture

```
GitHub (push to main)
  |
  |-- Cloudflare Pages (own GitHub integration, auto-deploy) --> frontend (static Vite build)
  |
  `-- ci.yml (frontend/backend/e2e) --> on success --> deploy.yml (new)
                                                            |
                                                          SSH
                                                            |
                                                            v
                                                  Oracle Cloud VPS (Ampere A1, ARM)
                                                            |
                                            docker compose: api, consumer, rabbitmq, redis, caddy
                                                            |
                                              caddy terminates TLS, reverse-proxies :443 -> api:8000
                                                            |
                                                  DuckDNS (yourapp.duckdns.org) --> VPS public IP

api / consumer  --> Supabase Postgres (pgvector extension enabled)
api /avatar     --> Supabase Storage (already existing, unchanged)
```

Postgres moves out of the VPS entirely (to Supabase, per the earlier "managed Postgres" decision); RabbitMQ and Redis stay self-hosted on the VPS rather than moving to CloudAMQP/Upstash, since they're already built and working in `compose.yml` and self-hosting them avoids onboarding two more free-tier accounts with their own separate limits.

## Components

### 1. VPS provisioning

Oracle Cloud "Always Free" Ampere A1 instance. Oracle cut this tier's allowance from 4 OCPU/24GB to 2 OCPU/12GB in June 2026 (no public announcement, confirmed via press coverage at brainstorming time); 2 OCPU/12GB is still comfortably enough for `api` + `consumer` + `rabbitmq` + `redis`.

Oracle's free ARM capacity is reported as inconsistent to provision in some regions. Try Frankfurt first, then Singapore, both reported as less contested than US East. If no region can be provisioned after real effort, fall back to GCP's `e2-micro` (also genuinely free forever, but only 1GB RAM: tight for this stack, likely needs swap space configured, and is a fallback, not the default).

Base image: Ubuntu, with Docker Engine + the Compose plugin installed. Firewall: only 22 (SSH) and 80/443 (Caddy) open publicly. RabbitMQ's management UI (15672), Redis (6379), and the app's own ports (8000/8001) stay internal to the Compose network, not published to the VPS's public interface, unlike local dev's `compose.yml`, which maps them to host ports for developer convenience.

### 2. `compose.yml` changes for production

Local dev's `compose.yml` stays untouched. Production adds a `compose.prod.yml` override file (standard Compose multi-file pattern: `docker compose -f compose.yml -f compose.prod.yml up -d --build api consumer rabbitmq redis caddy`) that:

- Explicitly names only `api`, `consumer`, `rabbitmq`, `redis`, `caddy` in the `up` command: `postgres` and `initdb` stay defined in the shared base file (harmless, simply never started in production) rather than requiring YAML tricks to un-declare them.
- Removes the host port publishes for `rabbitmq` and `redis` (internal-only in production).
- Adds a `caddy` service: reverse-proxies `yourapp.duckdns.org` to `api:8000`, terminates TLS automatically via Caddy's built-in Let's Encrypt client. One `Caddyfile`, checked into the repo (no secrets in it).

`.env.production` (already gitignored, lives only on the VPS) gets real values for `ADMIN_CRON_SECRET`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`, the Supabase Postgres connection string, `RABBITMQ_URL`, `REDIS_URL`, and `FRONTEND_URL` (the Cloudflare Pages URL).

### 3. Domain & TLS

DuckDNS gives a free subdomain (`yourapp.duckdns.org`). Oracle's free VM keeps a static public IP for its lifetime, so this is a one-time A-record pointing at that IP; DuckDNS's dynamic-update mechanism (built for changing IPs) isn't needed. Caddy handles Let's Encrypt certificate issuance and renewal automatically; no manual TLS work.

### 4. Deploy pipeline

A new `deploy.yml` workflow, triggered by `workflow_run` on `ci.yml`'s completion (success only) for pushes to `main`: it deploys only after `frontend`/`backend`/`e2e` all pass, never before. It SSHes into the VPS and runs `git pull && docker compose -f compose.yml -f compose.prod.yml up -d --build api consumer rabbitmq redis caddy`.

Building natively on the VPS via SSH (rather than building an image on GitHub's amd64 runners and pushing it) sidesteps ARM cross-compilation entirely. Docker automatically pulls the correct architecture's manifest for the base images (`node:22-alpine`, `rabbitmq:4-management`, `redis:7-alpine`) when building directly on the ARM host.

New GitHub repo secrets: `VPS_SSH_HOST`, `VPS_SSH_USER`, `VPS_SSH_PRIVATE_KEY`.

Frontend deploy is unaffected: Cloudflare Pages' own GitHub integration handles that independently, no custom Actions job needed.

### 5. Postgres migration to Supabase

Reuse the existing Supabase project already used for avatar Storage (one account to manage, rather than provisioning a second free project). Enable the `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector;` via the SQL editor, or Database → Extensions in the dashboard). Use Supabase's direct/session connection string, not the pgbouncer transaction pooler. The VPS runs long-lived processes, not serverless functions, and the transaction pooler's prepared-statement caveats aren't worth taking on for no benefit here.

Run `npx prisma migrate deploy` once against the Supabase connection string, the same command the project's own `npm run initdb` already uses locally, just pointed at a different database.

### 6. Secrets & cron wiring

`refresh-anime-cache.yml`'s `API_URL` secret becomes `https://yourapp.duckdns.org`; its `ADMIN_CRON_SECRET` secret matches the value set in the VPS's `.env.production`. `keep-alive.yml` (which already pings Supabase Storage to prevent its free-tier pause) needs no change: it already targets the right project once the existing Supabase Storage project is reused for Postgres too.

## Known Limitations

- **Single point of failure.** The VPS going down takes `api`, `consumer`, `rabbitmq`, and `redis` down together. Accepted for portfolio scale.
- **Oracle capacity risk.** No guaranteed fallback if every region is out of capacity at provisioning time beyond GCP's `e2-micro`, which is materially more resource-constrained (1GB RAM vs. 12GB).
- **No RabbitMQ/Redis backups.** Accepted: both are ephemeral and rebuildable. Redis is pure cache, and RabbitMQ queues drain naturally on restart. Postgres backups are Supabase's responsibility on their free tier.
- **No monitoring beyond Docker's restart policy.** If the VPS itself hangs, or the Docker daemon dies, nothing pages anyone. Acceptable for a resume project; revisit only if this becomes more than a demo.

## Testing Approach

- **Manual smoke test after first deploy:** hit `/health` on `api` and `consumer` through the public domain, verify a login/signup round-trips against the real Supabase Postgres, verify an avatar upload round-trips through `consumer`'s thumbnail pipeline end to end.
- **No new automated tests.** This is infrastructure, not application code. Existing CI (`frontend`/`backend`/`e2e`) is unaffected and continues gating merges to `main` exactly as before; `deploy.yml` only runs after those checks already passed.
