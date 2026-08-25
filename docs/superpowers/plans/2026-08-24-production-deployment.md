# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Read the "Execution Model" note below before starting.** Unlike a typical code plan, several tasks here require the human operator's own browser/account access and cannot be completed by an agent alone.

**Goal:** Get AnimeVerse reachable at a public URL for close to $0/month, with `api` and `consumer` running continuously (no cold starts) on a free-tier VPS, Postgres moved to Supabase, and auto-deploy on push to `main`. (The $0 goal isn't fully met: GCP charges for the VM's external IP. See the spec's "Real recurring cost" under Component 1.)

**Architecture:** A GCP `e2-micro` VPS (Oracle Cloud was the original plan; its Ampere A1 tier never had available capacity, see Task 1) runs `api`, `consumer`, `rabbitmq`, `redis`, and a new `caddy` reverse proxy via a standalone `compose.prod.yml`. Postgres moves to the Supabase project already used for avatar Storage. A DuckDNS subdomain points at the VPS's IP; Caddy handles TLS automatically. A new `deploy.yml` GitHub Actions workflow SSHes in and redeploys on every successful `main` build.

**Tech Stack:** Docker Compose, Caddy (reverse proxy + automatic TLS), GCP `e2-micro` (amd64), Supabase Postgres (pgvector, session pooler), DuckDNS, GitHub Actions (`workflow_run`, SSH deploy).

**Spec:** `docs/superpowers/specs/2026-08-24-production-deployment-design.md`

## Execution Model

This turned out more agent-executable than originally planned. Oracle's console-driven flow (the original plan for Task 1) would have needed the operator's own browser session throughout. GCP's `gcloud` CLI, used instead once Oracle's capacity never came through, only needs one human-in-the-loop step: `gcloud auth login`'s interactive OAuth browser flow. Everything after that, including project creation, billing linkage, firewall rules, and VM creation, ran as plain CLI commands. Tasks 2-3 still need the operator's own browser session for DuckDNS and the Supabase dashboard, since neither has a CLI this project already depends on. Tasks 4-6 are ordinary repo changes plus SSH/`gh` CLI commands, fully agent-executable given the VPS's IP/SSH access and the values Tasks 1-3 produced (domain, Supabase connection string).

Practically: an operator (the user) handles the one browser-only step in Task 1 plus all of Tasks 2-3, and hands the results to whoever runs the rest.

## Global Constraints

- $0/month recurring cost: every choice in this plan follows the spec's free-tier decisions (GCP Always Free, Supabase free tier, DuckDNS, Cloudflare Workers already in place for the frontend). In practice this VPS still costs ~$3.65/month for its external IP, since GCP started charging for those in February 2024 and Always Free doesn't cover it; see the spec's "Real recurring cost."
- No application code changes. Every file this plan creates is new infrastructure config (`compose.prod.yml`, `Caddyfile`, `.github/workflows/deploy.yml`); nothing in `src/` or `anime-verse-backend/{api,lib,consumer.ts}` changes.
- Commit messages: plain, direct, no conventional-commit prefixes (`feat:`, `fix:`, etc.), no AI attribution, matching this repo's existing convention.
- `.env.production` never gets committed (already gitignored): it's populated directly on the VPS, not through git.
- Backend TypeScript/config file conventions (4-space indent) don't apply here since no `.ts` files change, but YAML files in this plan (`compose.prod.yml`, `deploy.yml`, `Caddyfile`) should match this repo's existing 2-space YAML indent (see `.github/workflows/ci.yml`, `compose.yml`).

---

### Task 1: Provision the VPS

**What actually happened:** Oracle Cloud's Ampere A1 (this task's original plan) never provisioned. An automated retry loop cycled through all three Frankfurt availability domains for an extended period and never found capacity, and Free Tier accounts are restricted to a single region, so there was no other region to fall back to. GCP's `e2-micro` was used instead, and the steps below reflect that, driven through the `gcloud` CLI rather than a console, since CLI commands are exact and reproducible in a way that clicking through console screens isn't. If Oracle's capacity ever frees up, its console-driven steps are the same ones outlined in the spec's Component 1; they aren't repeated here since they were never actually exercised to completion.

**Files:** None. This task is entirely `gcloud` CLI and SSH, no repo changes.

**Interfaces:**
- Produces: a reachable Ubuntu VM with a public IP, Docker Engine + Compose plugin installed, a 2 GB swap file, ports 22/80/443 open. Every later task depends on having this IP and SSH access.

- [ ] **Step 1: Install the gcloud CLI and authenticate**

```bash
brew install --cask google-cloud-sdk
gcloud auth login
```
The second command opens a browser for an interactive OAuth flow. Complete it in the browser; the CLI picks up the resulting credentials automatically.

- [ ] **Step 2: Create a dedicated project and link billing**

```bash
gcloud projects create animeverse-prod-<unique-suffix> --name="AnimeVerse"
gcloud config set project animeverse-prod-<unique-suffix>
gcloud billing accounts list
```
Project IDs are globally unique across all of GCP, so pick a suffix unlikely to collide. The last command lists existing billing accounts on your Google account; if one already exists (likely, if you've used GCP before), link it:
```bash
gcloud billing projects link animeverse-prod-<unique-suffix> --billing-account=<ACCOUNT_ID>
```

- [ ] **Step 3: Enable the Compute Engine API**

```bash
gcloud services enable compute.googleapis.com --project=animeverse-prod-<unique-suffix>
```
This fails with a billing-not-found error if Step 2's billing link didn't actually take. Confirm the link succeeded before retrying.

- [ ] **Step 4: Generate an SSH key pair for the VPS**

On your local machine:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/animeverse-vps -N ""
```
This produces `~/.ssh/animeverse-vps` (private key) and `~/.ssh/animeverse-vps.pub` (public key, used in Step 6).

- [ ] **Step 5: Open the firewall for HTTP/HTTPS**

```bash
gcloud compute firewall-rules create allow-http-https \
  --project=animeverse-prod-<unique-suffix> \
  --network=default \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:80,tcp:443 \
  --source-ranges=0.0.0.0/0
```
Port 22 is already open by GCP's `default-allow-ssh` rule, present on every new project's default network.

- [ ] **Step 6: Create the VM**

```bash
gcloud compute instances create animeverse-prod \
  --project=animeverse-prod-<unique-suffix> \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --metadata=ssh-keys="ubuntu:$(cat ~/.ssh/animeverse-vps.pub)"
```
`e2-micro` is only Always Free-eligible in specific US regions (`us-central1`, `us-west1`, `us-east1`), not in Europe. `pd-standard` (not the newer default `pd-balanced`) is what the Always Free tier's 30 GB disk allowance actually covers. The command prints the instance's external IP on success; record it as `<INSTANCE_PUBLIC_IP>`, every later task needs it.

- [ ] **Step 7: Verify SSH access**

```bash
ssh -i ~/.ssh/animeverse-vps -o StrictHostKeyChecking=accept-new ubuntu@<INSTANCE_PUBLIC_IP> 'echo ok'
```
The VM needs a few seconds to finish booting before SSH responds; retry if it's refused at first.

- [ ] **Step 8: Install Docker and set up swap**

```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu'
```
`e2-micro`'s 1 GB RAM is tight enough that building this app's Docker images on-box (`npm ci` plus `tsc`) risks the build itself getting OOM-killed, so add swap before building anything:
```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> 'sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab'
```

- [ ] **Step 9: Verify**

```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> 'docker --version && docker compose version && free -h'
```
Expected: version numbers with no permission errors, and `free -h` showing the 2 GB swap file active.

**Known gap, not addressed by these steps:** the VM above gets GCP's default ephemeral external IP. A reserved static IP costs nothing extra while attached to a running instance and would avoid the DuckDNS A record silently going stale if the VM is ever stopped and restarted. Worth adding (`gcloud compute addresses create` plus attaching it) if this VM is ever recreated.

---

### Task 2: Point a domain at the VPS

**Files:** None. DuckDNS's own dashboard, no repo changes.

**Interfaces:**
- Consumes: `<INSTANCE_PUBLIC_IP>` from Task 1.
- Produces: a public hostname resolving to the VPS. Task 4's `Caddyfile` and Task 5's secrets both need this hostname. The actual hostname is `animeverse-app.duckdns.org`, not `animeverse.duckdns.org`: that shorter name was already taken by another DuckDNS user (subdomains are globally unique across all users, not just your account).

- [ ] **Step 1: Claim a DuckDNS subdomain**

Sign in at https://www.duckdns.org (GitHub or Google login), enter a subdomain name under "add domain," and confirm it's added to your list. Try the app's plain name first; if it's taken, a small variation (an extra word, a suffix) resolves it, since DuckDNS names are global.

- [ ] **Step 2: Point it at the VPS**

In the DuckDNS dashboard, paste `<INSTANCE_PUBLIC_IP>` into the "current ip" field for your subdomain and save. As long as the VPS keeps this IP, no dynamic-update script or cron job is needed; this is a one-time setting. (GCP's `e2-micro` gets an ephemeral IP by default, see Task 1's known gap: if the VM is ever stopped and restarted, this step needs redoing.)

- [ ] **Step 3: Verify**

```bash
dig +short animeverse-app.duckdns.org
```
Expected: prints `<INSTANCE_PUBLIC_IP>`. DNS propagation can take a few minutes; retry if it's empty at first.

---

### Task 3: Move Postgres to Supabase

**Files:**
- Modify (locally, not committed): `anime-verse-backend/.env.local` is NOT touched. The migration runs via an inline env var instead, per this project's established convention for one-off commands against a specific database.

**Interfaces:**
- Consumes: nothing from earlier tasks (independent of the VPS).
- Produces: a Supabase Postgres connection string with the current schema applied and the `vector` extension enabled. Task 4's `.env.production` needs this connection string as `POSTGRES_URL`.

- [ ] **Step 1: Enable the pgvector extension**

In the existing Supabase project (the one already used for avatar Storage, same project as `SUPABASE_URL`/`SUPABASE_KEY` in `.env.production`), open SQL Editor and run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

- [ ] **Step 2: Get the session pooler connection string**

In the Supabase dashboard: Project Settings → Database → Connection string, and select **"Session pooler"** (also called "Session mode"), not "Direct connection" and not "Transaction pooler". Copy it: `postgresql://postgres.<ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres`.

Direct connection doesn't actually work here: its hostname is IPv6-only (Supabase stopped giving free IPv4 addresses for direct connections), and neither GCP nor Oracle VPSes have outbound IPv6 by default, so it never resolves. The session pooler is reachable over IPv4 and, unlike the transaction pooler (port 6543 on the same hostname), supports prepared statements, so Prisma's default query behavior works unmodified. Confirm the connection string uses port 5432: that's what distinguishes session mode from the transaction pooler's 6543.

- [ ] **Step 3: Apply the schema**

From `anime-verse-backend/` (any machine with the repo checked out and network access to Supabase; this worktree is fine):
```bash
POSTGRES_URL="<the connection string from Step 2>" npx prisma migrate deploy
```
This can fail with Prisma error P3005 ("the database schema is not empty"), even though none of this app's tables exist yet: a fresh Supabase project already has its own `keep_alive` table and the `vector` extension's own objects in the `public` schema, which trips Prisma's first-deploy safety check. If that happens, apply each migration's SQL directly instead, then tell Prisma's tracking table they're accounted for:
```bash
for dir in prisma/migrations/*/; do
  PGPASSWORD="<your Supabase DB password>" psql "postgresql://postgres.<ref>@aws-<n>-<region>.pooler.supabase.com:5432/postgres" -v ON_ERROR_STOP=1 -f "${dir}migration.sql" || { echo "Migration failed: ${dir}migration.sql" >&2; exit 1; }
done
for dir in prisma/migrations/*/; do
  POSTGRES_URL="<the connection string from Step 2>" npx prisma migrate resolve --applied "$(basename "$dir")"
done
```
`psql` needs `libpq` installed locally (`brew install libpq`) if not already present.

- [ ] **Step 4: Verify**

```bash
PGPASSWORD="<your Supabase DB password>" psql "postgresql://postgres.<ref>@aws-<n>-<region>.pooler.supabase.com:5432/postgres" -c "SELECT migration_name, finished_at IS NOT NULL as finished FROM _prisma_migrations ORDER BY started_at;"
```
Expected: all 5 migrations listed with `finished = t`. (`prisma migrate status`'s own summary line can read as "0 applied, 0 pending" even when everything is correctly applied; it means nothing new happened on that particular invocation, not that nothing is applied. Check the actual `_prisma_migrations` table, as above, for ground truth.)

Record the connection string from Step 2: Task 4's `.env.production` needs it.

---

### Task 4: Production Compose file, reverse proxy, and first manual deploy

**Files:**
- Create: `anime-verse-backend/compose.prod.yml`
- Create: `anime-verse-backend/Caddyfile`

**Interfaces:**
- Consumes: `<INSTANCE_PUBLIC_IP>` and SSH access from Task 1, the domain from Task 2, the Supabase connection string from Task 3.
- Produces: a running production stack reachable at `https://animeverse-app.duckdns.org`. Task 5's `deploy.yml` re-runs this same `docker compose` command on every push.

- [ ] **Step 1: Write `compose.prod.yml`**

This is a standalone production file, not a `-f compose.yml -f compose.prod.yml` override: `api` and `consumer` both declare `depends_on: postgres` and `depends_on: initdb` in `compose.yml`, and Compose starts a named service's dependencies regardless of which services are listed on the `up` command line. An override approach would drag `postgres`/`initdb` back in even though production doesn't run them. A standalone file that never mentions them sidesteps this.

Create `anime-verse-backend/compose.prod.yml`:
```yaml
x-app: &app
  build: .
  env_file: .env.production
  restart: unless-stopped

x-app-depends-on: &app-depends-on
  migrate:
    condition: service_completed_successfully
  rabbitmq:
    condition: service_healthy
    restart: true
  redis:
    condition: service_healthy
    restart: true

services:
  migrate:
    <<: *app
    command: [ "npx", "prisma", "migrate", "deploy" ]
    restart: "no"

  api:
    <<: *app
    healthcheck:
      test: [ "CMD", "node", "-e", "fetch('http://localhost:8000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" ]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on: *app-depends-on

  consumer:
    <<: *app
    command: [ "sh", "-c", "npm run prestart && npx tsx consumer.ts" ]
    healthcheck:
      test: [ "CMD", "node", "-e", "fetch('http://localhost:8001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" ]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on: *app-depends-on

  rabbitmq:
    image: rabbitmq:4-management
    hostname: rabbitmq
    restart: unless-stopped
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      # rabbitmq-diagnostics itself boots a small Erlang runtime to connect,
      # which on a constrained box (e.g. a 1GB-RAM e2-micro) can take ~25s
      # on its own, and RabbitMQ's own startup can take well over a minute
      # under memory pressure. Local dev's compose.yml keeps the tighter
      # defaults since that's a normal dev machine.
      test: [ "CMD", "rabbitmq-diagnostics", "ping" ]
      interval: 30s
      timeout: 30s
      retries: 5
      start_period: 180s

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 2s
      timeout: 5s
      retries: 5
      start_period: 5s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddyfile:ro
      - caddy_data:/data
    command: caddy run --config /etc/caddyfile
    depends_on:
      - api

volumes:
  caddy_data:
  rabbitmq_data:
```
`migrate` runs `prisma migrate deploy` once and exits; `api` and `consumer` both wait on it completing successfully before they start, so a pending schema change from a new commit is applied before the new code that depends on it goes live. `rabbitmq` sets an explicit `hostname` because RabbitMQ names its Mnesia data directory after the node name (`rabbit@<hostname>`); without a fixed hostname, a recreated container gets Docker's default random hostname and opens a different (empty) directory, silently orphaning the `rabbitmq_data` volume's actual contents. `rabbitmq_data` persists RabbitMQ's own durable storage (pending and dead-lettered messages) across container recreation, not just process restarts, now that the hostname is stable. `api`, `consumer`, and `migrate` share their `build`/`env_file`/`restart` via the `x-app` anchor, and `api`/`consumer` share their `depends_on` via `x-app-depends-on`, since those blocks were previously copy-pasted identically across services. Unlike `compose.yml`, no service here publishes a host port except `caddy` (80/443). `rabbitmq`, `redis`, `api` (8000), and `consumer` (8001) stay reachable only from other containers on the compose-created network, matching the spec's firewall design.

- [ ] **Step 2: Write the Caddyfile**

Create `anime-verse-backend/Caddyfile` (use the actual domain from Task 2):
```
animeverse-app.duckdns.org {
	reverse_proxy api:8000
}
```
Caddy issues and renews the TLS certificate for this domain automatically via Let's Encrypt the first time it starts, no manual cert work.

- [ ] **Step 3: Copy the repo and write `.env.production` on the VPS**

```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> \
  'git clone https://github.com/minkim26/AnimeVerse.git ~/animeverse'
```

Then create `.env.production` directly on the VPS (it's gitignored, so it never travels through git):
```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> 'cat > ~/animeverse/anime-verse-backend/.env.production' <<'EOF'
POSTGRES_URL=<the Supabase connection string from Task 3>
JWT_SECRET=<a long random value, e.g. output of `openssl rand -hex 32`>
ADMIN_CRON_SECRET=<a long random value, at least 32 characters, required by lib/adminAuth.ts>
PORT=8000
SUPABASE_URL=<same value already used in local dev>
SUPABASE_KEY=<same service_role key already used in local dev>
RABBITMQ_URL=amqp://rabbitmq
REDIS_URL=redis://redis
FRONTEND_URL=<the Cloudflare Workers URL for the frontend>
EOF
```
`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` from `.env.example` are omitted here on purpose: those only configure the official `postgres` image's own initialization, which `compose.prod.yml` doesn't run.

- [ ] **Step 4: First manual deploy**

```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> \
  'cd ~/animeverse/anime-verse-backend && docker compose -f compose.prod.yml up -d --build'
```
Building happens natively on the VPS, so Docker automatically pulls the correct architecture's manifest for `node:22-alpine`, `rabbitmq:4-management`, and `redis:7-alpine` with no cross-compilation step. This VPS is amd64, but the same command works unmodified regardless of architecture. The same `up -d --build` also runs `migrate` first, since `api` and `consumer` both depend on it completing successfully, so this one command both applies any pending Prisma migration and starts the stack; there's no separate migration step to run by hand.

On first run, `rabbitmq` becoming healthy can take a couple of minutes under this box's memory pressure (see the healthcheck comment in Step 1); `api`/`consumer` won't start until it does, since they depend on it. A `docker compose -f compose.prod.yml up -d` retry (no `--build` needed) after `rabbitmq` is confirmed healthy resolves a first-attempt startup-ordering race where `api`/`consumer` were evaluated as dependents before `rabbitmq` finished booting.

- [ ] **Step 5: Verify**

```bash
curl -sf https://animeverse-app.duckdns.org/health
```
Expected: a successful response (HTTP 200) with a valid TLS certificate, no `-k`/insecure flag needed.

Check `consumer` separately, since its health endpoint stays internal:
```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> \
  'cd ~/animeverse/anime-verse-backend && docker compose -f compose.prod.yml exec consumer wget -qO- http://localhost:8001/health'
```
Expected: a successful health response.

- [ ] **Step 6: Commit**

```bash
git add compose.prod.yml Caddyfile
git commit -m "Add production Compose file and Caddy reverse proxy"
```
(`.env.production` is not part of this commit. It's gitignored and lives only on the VPS.)

---

### Task 5: Auto-deploy on push to main

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: SSH access to the VPS from Task 1 (as GitHub repo secrets, not hardcoded).
- Produces: automatic redeploys on every successful `ci.yml` run on `main`.

- [ ] **Step 1: Add the SSH deploy key as a GitHub repo secret**

```bash
gh secret set VPS_SSH_PRIVATE_KEY < ~/.ssh/animeverse-vps
gh secret set VPS_SSH_HOST -b"<INSTANCE_PUBLIC_IP>"
gh secret set VPS_SSH_USER -b"ubuntu"
```

- [ ] **Step 2: Write the workflow**

`.github/workflows/ci.yml`'s top-level `name:` is `CI` (confirmed by reading the file), so `workflow_run` below targets that exact name.

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_SSH_HOST }}
          username: ${{ secrets.VPS_SSH_USER }}
          key: ${{ secrets.VPS_SSH_PRIVATE_KEY }}
          script: |
            cd ~/animeverse
            git pull
            cd anime-verse-backend
            docker compose -f compose.prod.yml up -d --build
```

- [ ] **Step 3: Validate the YAML**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/deploy.yml'))"
```
Expected: no output, exit code 0.

No test-first cycle here, matching this repo's existing convention for scheduled/triggered workflow files (see `refresh-anime-cache.yml`'s plan). `workflow_run` only fires for workflow files that already exist on the repository's default branch, so this cannot be exercised from a feature branch at all. It only starts firing once merged to `main`; verify after merging by pushing a trivial commit and watching `gh run list --workflow=deploy.yml`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add auto-deploy to the VPS on successful CI runs"
```

---

### Task 6: Wire up the existing cron workflow

**Files:** None. GitHub repo secrets only, `refresh-anime-cache.yml` itself doesn't change.

**Interfaces:**
- Consumes: the domain from Task 2, `ADMIN_CRON_SECRET` from Task 4's `.env.production`.
- Produces: nothing consumed by later tasks. This is the plan's last task.

`refresh-anime-cache.yml` (added in PR #13) already reads `secrets.API_URL` and `secrets.ADMIN_CRON_SECRET`; both are currently unset since no deployment existed until now.

- [ ] **Step 1: Set the secrets**

```bash
gh secret set API_URL -b"https://animeverse-app.duckdns.org"
gh secret set ADMIN_CRON_SECRET -b"<the exact same value written into .env.production in Task 4>"
```

- [ ] **Step 2: Verify**

```bash
gh workflow run refresh-anime-cache.yml
gh run watch $(gh run list --workflow=refresh-anime-cache.yml --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: the run completes successfully (exit code 0), meaning the deployed API accepted the request and enqueued a batch.

- [ ] **Step 3: Commit**

Nothing to commit. This task only sets repo secrets. Skip straight to "After all tasks."

---

## After all tasks

Run the full manual smoke test from the spec:

1. `curl -sf https://animeverse-app.duckdns.org/health`, expect 200.
2. Sign up for a new account through the deployed frontend (the Cloudflare Workers URL), confirm login round-trips against the real Supabase Postgres.
3. Upload an avatar from the profile page, confirm the "Generating thumbnail..." state resolves once `consumer` finishes processing it (checks the full RabbitMQ → `consumer` → Supabase Storage path end to end).

All three must pass before considering this deployment live. `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` in `.env.example` remain accurate for local dev (`compose.yml` is untouched) but are correctly absent from the production `.env.production` written in Task 4.

Once Task 5 is done: `gh run list --workflow=deploy.yml --limit 1` after merging to `main` and pushing a trivial follow-up commit, confirming it ran and succeeded. This is Task 5's own acceptance check, not part of the live-deployment criteria above.
