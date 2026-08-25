# Production Deployment

## Overview

AnimeVerse had no production deployment target before this. The old GitHub Pages workflow was gone, `ci.yml` only lints/builds/tests with no deploy step, and a real host was needed before the app was reachable outside local dev. This closes that gap using the app's existing Docker images and Compose setup almost unchanged, at close to $0/month. See CLAUDE.md's Architecture section and README.md's Deployment section for where things ended up; this document covers the reasoning and the parts of the plan that changed once real provisioning started.

The driving constraint was cost, confirmed explicitly by the user: $0/month was set as a hard line, not a preference. That ruled out every fully-managed compute option (Render, Railway, Fly.io) once a second constraint is added: no cold starts, on either the API or the background worker. Covering both with an always-on paid instance runs ~$14/mo, and no free tier of a request-driven PaaS can keep a non-request-driven worker warm without either exceeding its free instance-hour budget or leaving queue messages stuck until the next external ping happens to land (see "Alternatives Considered"). **That hard line isn't actually met today:** see "Real recurring cost" under Component 1 for why, and "Roadmap: a serverless path to $0/month" at the end of this document for the option that would close the gap.

## Goals

- $0/month recurring hosting cost. (Not currently met: see "Real recurring cost" below.)
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
  |-- Cloudflare Workers (own GitHub integration, auto-deploy) --> frontend (static Vite build)
  |
  `-- ci.yml (frontend/backend/e2e) --> on success --> deploy.yml (planned, not yet built)
                                                            |
                                                          SSH
                                                            |
                                                            v
                                                  GCP e2-micro VPS (amd64)
                                                            |
                                            docker compose: api, consumer, rabbitmq, redis, caddy
                                                            |
                                              caddy terminates TLS, reverse-proxies :443 -> api:8000
                                                            |
                                        DuckDNS (animeverse-app.duckdns.org) --> VPS public IP

api / consumer  --> Supabase Postgres (pgvector extension enabled)
api /avatar     --> Supabase Storage (already existing, unchanged)
```

The frontend runs on Cloudflare Workers with static assets, not Cloudflare Pages: Cloudflare shifted new projects to a unified Workers-plus-static-assets flow, and a `wrangler.jsonc` at the repo root configures it. The backend runs on GCP rather than Oracle Cloud: see Component 1 below for why.

Postgres moves out of the VPS entirely (to Supabase, per the earlier "managed Postgres" decision); RabbitMQ and Redis stay self-hosted on the VPS rather than moving to CloudAMQP/Upstash, since they're already built and working in `compose.yml` and self-hosting them avoids onboarding two more free-tier accounts with their own separate limits.

## Components

### 1. VPS provisioning

**What actually happened:** Oracle Cloud's "Always Free" Ampere A1 was the original plan (2 OCPU/12GB after Oracle's June 2026 cut from 4/24, comfortably enough for `api` + `consumer` + `rabbitmq` + `redis`), but its ARM capacity turned out to be unavailable across all three Frankfurt availability domains, even with a payment method on file and after an automated retry loop cycling through all three ADs for an extended period found no opening. Free Tier accounts are also restricted to a single region, so falling back to a less-contested region like Singapore wasn't an option once Frankfurt was chosen as the account's fixed home region. GCP's `e2-micro` (also genuinely free forever) was used instead, and is the platform actually running in production.

**GCP `e2-micro` specs:** 2 shared vCPUs, 1 GB RAM, x86-64 (amd64, not ARM), `us-central1-a`. The Always Free tier restricts this instance type to US regions (Oregon, Iowa, South Carolina) rather than Europe. 1 GB RAM is genuinely tight: building the Docker images (`npm ci` plus `tsc`) on-box risked OOM before the containers even started, so a 2 GB swap file was added first as a buffer. With swap in place, the full stack builds and runs successfully, just slowly: a cold build of all five services took on the order of 15-20 minutes, dominated by swap-heavy disk I/O during image layer export and unpacking, not by any actual resource insufficiency once running.

Base image: Ubuntu 24.04 LTS, with Docker Engine + the Compose plugin installed via `get.docker.com`. Firewall: only 22 (SSH, open by GCP's `default-allow-ssh` rule) and 80/443 (Caddy, via a new `allow-http-https` VPC firewall rule) open publicly. RabbitMQ's management UI (15672), Redis (6379), and the app's own ports (8000/8001) stay internal to the Compose network, not published to the VPS's public interface, unlike local dev's `compose.yml`, which maps them to host ports for developer convenience. GCP's firewall model is single-layer (VPC firewall rules), unlike Oracle's two-layer Security List plus OS-level `iptables` setup that the original plan anticipated.

**Known gap:** the VM was created with GCP's default ephemeral external IP, not a reserved static one. If the VM is ever stopped and restarted, its external IP can change, which would silently break the DuckDNS A record until manually updated. Reserving a static IP would fix that, but wouldn't change the cost below (see "Real recurring cost"): since February 2024, GCP charges the same $0.005/hr for an in-use external IPv4 address whether it's ephemeral or reserved-static, so this is worth fixing for reliability, not for savings.

**Real recurring cost:** this deployment is not actually $0/month. GCP has charged $0.005/hr for any in-use external IPv4 address on a standard VM since February 2024 (confirmed against Google's own pricing announcement), and Always Free's documented coverage (1 `e2-micro` instance-hour, 30GB disk, 1GB egress) doesn't include it as a separate line item. That's roughly $3.65/month, running continuously, for as long as this VM has a public IP, which it always will (Caddy needs one to terminate TLS for inbound traffic). Verified against this project's actual `animeverse-prod-2026` GCP project: the running instance has a live external IP (`34.42.195.208`, ephemeral, billed the same as static) and an open, funded billing account. At the time this was checked, no charge had actually hit a payment method, because the billing account was still inside GCP's $300/90-day new-account free trial credit, which silently absorbs small per-hour charges like this one without showing up as an "amount due." That credit is temporary; once it's exhausted or the 90 days pass, this becomes a real recurring charge unless something changes before then.

Removing the public IP doesn't fix this either. A GCP VM with no external IP has no outbound internet access at all unless it goes through Cloud NAT, and Cloud NAT costs more than the direct IP charge it would replace: NAT still needs its own external IP ($0.005/hr, same rate), plus a $0.0014/hr gateway fee, plus $0.045/GiB on all data processed through it. Fronting the VM with something like Cloudflare Tunnel removes the need for *inbound* ports, but the VM still needs outbound reachability to run the tunnel client at all, which loops back to the same external-IP-or-NAT choice. There's no GCP-side configuration that gets this workload to $0/month once it needs both inbound serving and outbound internet access (Supabase, Docker Hub, npm, `git pull`). Oracle Cloud's Always Free tier, by contrast, still includes 2 reserved public IPs at no charge; if Oracle's Ampere A1 capacity ever frees up (see the retry-loop history above), moving back there is the actual path to $0/month on this same architecture, not any GCP reconfiguration.

### 2. `compose.yml` changes for production

Local dev's `compose.yml` stays untouched. Production gets its own standalone `compose.prod.yml`, not a Compose override merged with `-f compose.yml -f compose.prod.yml`: `api` and `consumer` both declare `depends_on: postgres` and `depends_on: initdb` in the base file, and Compose starts a named service's dependencies regardless of which services you list on the `up` command line, so an override approach would drag `postgres`/`initdb` back in by default. A standalone file that simply never mentions them sidesteps this instead of fighting Compose's merge semantics.

`compose.prod.yml` defines six services:

- `migrate`: runs `prisma migrate deploy` once and exits; `api` and `consumer` both wait for it to complete successfully before starting.
- `api`, `consumer`: same `build: .` and `env_file: .env.production` as local dev, with no `postgres`/`initdb` dependency (Postgres is now Supabase, reached over the network like any other external service).
- `rabbitmq`, `redis`: same images as local dev, no host port publishes (internal-only in production, unlike local dev's convenience mappings).
- `caddy`: reverse-proxies `animeverse-app.duckdns.org` to `api:8000`, terminates TLS automatically via Caddy's built-in Let's Encrypt client. One `Caddyfile`, checked into the repo (no secrets in it).

`.env.production` (already gitignored, lives only on the VPS) gets real values for `ADMIN_CRON_SECRET`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`, the Supabase Postgres connection string, `RABBITMQ_URL`, `REDIS_URL`, and `FRONTEND_URL` (the Cloudflare Workers URL).

The RabbitMQ healthcheck needed more generous timing than local dev's defaults once running for real: on the 1 GB RAM box, RabbitMQ's own Erlang startup took over two minutes, and even a single `rabbitmq-diagnostics ping` invocation took around 25 seconds to execute. The production healthcheck uses `interval: 30s`, `timeout: 30s`, and `start_period: 180s` for `rabbitmq` specifically, well beyond what local dev's stronger hardware needs. `api` and `consumer`'s own healthchecks (Node's native `fetch`, much lighter than RabbitMQ's Erlang diagnostics tool) kept their original timing and were never an issue.

### 3. Domain & TLS

DuckDNS gives a free subdomain. `animeverse.duckdns.org` was already taken by another user (DuckDNS subdomains are globally unique), so the actual subdomain is `animeverse-app.duckdns.org`. This is a one-time A-record pointing at the VPS's IP; DuckDNS's dynamic-update mechanism (built for changing IPs) isn't needed as long as that IP stays fixed (see the ephemeral-IP gap noted in Component 1). Caddy handles Let's Encrypt certificate issuance and renewal automatically; no manual TLS work.

### 4. Deploy pipeline

**Status: designed, not yet built.** Task 5 of the implementation plan (below) was never executed, so `.github/workflows/deploy.yml` doesn't exist yet and every deploy so far has been the manual SSH command from Task 4. The design below is what that task will produce once it's done.

A new `deploy.yml` workflow, triggered by `workflow_run` on `ci.yml`'s completion (success only) for pushes to `main`: it deploys only after `frontend`/`backend`/`e2e` all pass, never before. It SSHes into the VPS and runs `git pull && docker compose -f compose.prod.yml up -d --build`.

`workflow_run` only fires for workflow files that already exist on the repository's default branch, so `deploy.yml` will not trigger from a feature branch. It only starts working once merged to `main`.

Building natively on the VPS via SSH was originally motivated by avoiding ARM cross-compilation on Oracle. That reasoning no longer applies since the VPS ended up on GCP's amd64 `e2-micro`, but the same SSH-based approach was kept anyway: it needs no container registry or image-push step, and Docker still resolves the correct base image manifest automatically regardless of architecture.

New GitHub repo secrets: `VPS_SSH_HOST`, `VPS_SSH_USER`, `VPS_SSH_PRIVATE_KEY`.

Each successful deploy also registers a GitHub Deployment against a `production` environment, `environment_url` set to the live domain, visible at github.com/minkim26/AnimeVerse/deployments. Nothing posts to that API today; the three entries there now are leftovers from the old, removed `github-pages` workflow. See the plan's Task 5 for the exact steps (`chrnorm/deployment-action` / `chrnorm/deployment-status`), and note that this needs a `permissions: deployments: write` block, since the default `GITHUB_TOKEN` only carries `contents: read`.

Frontend deploy is unaffected: Cloudflare's own GitHub integration handles that independently, no custom Actions job needed.

### 5. Postgres migration to Supabase

Reuse the existing Supabase project already used for avatar Storage (one account to manage, rather than provisioning a second free project). Enable the `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector;` via the SQL editor, or Database → Extensions in the dashboard).

**What actually worked:** Supabase's direct connection hostname turned out to be IPv6-only. Supabase stopped giving free IPv4 addresses for direct database connections a while back, and neither GCP nor Oracle boxes have outbound IPv6 by default, so the direct connection string (originally planned here) simply doesn't resolve from the VPS. The session pooler (not the transaction pooler) is what actually works: same long-lived-connection behavior as a direct connection, including support for prepared statements, but reachable over IPv4 through Supabase's pooler infrastructure. The connection string looks like `postgresql://postgres.<ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres`, port 5432 confirming session mode rather than the transaction pooler's 6543.

Migrations only create the schema, not data. `Quote` and `Title` are static, seeded tables (`prisma/seed.ts`), and `compose.prod.yml`'s `migrate` service (Component 2) deliberately only runs `prisma migrate deploy`, not the seed script: `seed.ts` uses `createMany` against tables with no unique constraint, so running it on every deploy would insert duplicate rows rather than being a no-op. Seeding is a one-time manual step instead (see the plan's Task 3), the same treatment as the P3005 migration workaround above. Skipping it leaves `GET /quotes/random` and `GET /titles/random` returning successfully with empty results, and the Profile page's title/quote widgets never populate.

Run `npx prisma migrate deploy` once against the Supabase connection string, the same command the project's own `npm run initdb` already uses locally, just pointed at a different database. In practice, Supabase projects are never truly empty at the database level (its own `keep_alive` table and the `vector` extension's own objects land in `public`), which trips Prisma's first-deploy "is this database empty" safety check even though none of the app's own tables exist yet. The fix was to apply each migration's SQL directly via `psql`, then mark each one as applied with `prisma migrate resolve --applied <name>` so future `migrate deploy` runs recognize them as already applied.

### 6. Secrets & cron wiring

`refresh-anime-cache.yml`'s `API_URL` secret becomes `https://animeverse-app.duckdns.org`; its `ADMIN_CRON_SECRET` secret matches the value set in the VPS's `.env.production`. `keep-alive.yml` (which already pings Supabase Storage to prevent its free-tier pause) needs no change: it already targets the right project once the existing Supabase Storage project is reused for Postgres too.

## Known Limitations

- **Single point of failure.** The VPS going down takes `api`, `consumer`, `rabbitmq`, and `redis` down together. Accepted for portfolio scale.
- **Ephemeral GCP IP.** The VM uses GCP's default ephemeral external IP rather than a reserved static one. If the VM is ever stopped and restarted, its IP can change, silently breaking the DuckDNS A record until manually updated. Reserving a static IP fixes that reliability gap but costs the same as the ephemeral one (see Component 1's "Real recurring cost").
- **Not actually $0/month.** GCP's external IP charge (~$3.65/month) means this deployment costs money once the new-account free trial credit currently covering it runs out. See Component 1 and the "Roadmap" section below.
- **1 GB RAM is workable but slow.** The full stack builds and runs correctly on `e2-micro`, but a cold build takes 15-20 minutes due to swap-heavy disk I/O, and RabbitMQ specifically needs generous healthcheck timing (see Component 2) to avoid being marked unhealthy during its own slow startup.
- **No RabbitMQ/Redis backups.** Accepted: Redis is pure cache, safe to lose. RabbitMQ persists its queues to a named volume (`rabbitmq_data`) with a pinned `hostname: rabbitmq`, so pending and dead-lettered messages survive a container restart or recreation, but the volume itself isn't backed up. (RabbitMQ names its Mnesia data directory after the node name; without the pinned hostname, a recreated container would get Docker's default random hostname and open a different, empty directory, making the volume's actual contents invisible even though nothing was deleted.) Postgres backups are Supabase's responsibility on their free tier.
- **No monitoring beyond Docker's restart policy.** If the VPS itself hangs, or the Docker daemon dies, nothing pages anyone. Acceptable for a resume project; revisit only if this becomes more than a demo.

## Testing Approach

- **Manual smoke test after first deploy:** hit `/health` on `api` through the public domain (`https://animeverse-app.duckdns.org/health`); `consumer`'s `/health` stays internal per the firewall design above, so check it over SSH instead (`docker compose -f compose.prod.yml exec consumer wget -qO- http://localhost:8001/health`). Verify a login/signup round-trips against the real Supabase Postgres, and an avatar upload round-trips through `consumer`'s thumbnail pipeline end to end.
- **No new automated tests.** This is infrastructure, not application code. Existing CI (`frontend`/`backend`/`e2e`) is unaffected and continues gating merges to `main` exactly as before. Once `deploy.yml` is built (see Component 4), it's designed to only run after those checks already passed.

## Roadmap: a serverless path to $0/month

Not started. Documented here because the current architecture's ~$3.65/month gap (see Component 1) is real and ongoing, and this is the option that would actually close it rather than just relocating it.

**Why this, specifically:** the original brainstorming rejected fully-managed/serverless hosting because of one concrete failure mode: on a request-driven, scale-to-zero PaaS (Render, Fly), a sleeping worker only wakes up when something pings it over HTTP. `consumer.ts` doesn't receive HTTP requests, it holds a persistent RabbitMQ connection and reacts to messages landing in a queue, so a message arriving while the worker is asleep just sits there until the next unrelated ping happens to wake it. That's a correctness problem, not a latency one, and it ruled out every PaaS free tier considered at the time.

AWS Lambda triggered by SQS doesn't have that failure mode: SQS message arrival is itself the invocation trigger, handled by AWS's own polling infrastructure, not the app. There's no external ping to wait for and no separate "is anyone home" check. Combined with Lambda's request-driven API side, this removes the one thing that made every other serverless option a non-starter, and it does so without ever holding a VM, so there's no external IP to be billed for in the first place.

The cost basis was checked, not assumed. Lambda's 1M requests and 400,000 GB-seconds per month sit in AWS's permanent Always Free tier, not the 12-month new-account trial most of AWS's free tier actually is, confirmed against AWS's current pricing page rather than taken on faith. SQS carries the same permanent 1M-requests-per-month allowance. The Redis side needs more care: AWS's own ElastiCache is only free for 12 months, so it isn't a fit, but Upstash's Redis free tier (256MB, 500,000 commands/month, no card required) is permanent and covers this app's actual Redis usage with room to spare (a handful of rate-limit checks and cache reads per request, at hobby-project traffic). On ingress, Lambda Function URLs carry no request charge at all; API Gateway's HTTP API type is free for the first 1M requests/month for 12 months only, then $1/million after, negligible either way at this traffic level. Cloudflare, already fronting the frontend, can put a CNAME in front of either one and handle TLS the same way Caddy does now.

At this app's traffic, the recurring cost of this setup rounds to $0, with no expiring credit involved anywhere in the stack, unlike GCP's IP charge or the trial currently masking it.

**What this is not:** a hosting swap. It means replacing RabbitMQ with SQS (`lib/queue.ts`, `consumer.ts`'s message handling, and the DLQ mechanism all get rewritten against a different API and delivery model), replacing `lib/redis.ts`/`lib/cache.ts`/`lib/rateLimit.ts`'s persistent-connection Redis client with Upstash's REST-based one, wrapping (or rewriting) `app.ts`'s Express routes to run as Lambda handlers, and reconsidering how Prisma's connection pooling behaves under Lambda's bursty, concurrent-cold-start execution model (Supabase's transaction pooler is likely the better fit there than the session pooler currently in use, which would mean revisiting the prepared-statement question Component 5 already worked through once). Deploy tooling changes entirely too, from `docker compose up --build` over SSH to an infrastructure-as-code tool (SAM, CDK, or Serverless Framework). This is a real, separately-scoped migration, not a follow-up task to bolt onto this one, and it needs its own brainstorming pass before implementation, same as this deployment did.
