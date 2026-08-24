# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Read the "Execution Model" note below before starting.** Unlike a typical code plan, several tasks here require the human operator's own browser/account access and cannot be completed by an agent alone.

**Goal:** Get AnimeVerse reachable at a public URL for $0/month, with `api` and `consumer` running continuously (no cold starts) on a free-tier VPS, Postgres moved to Supabase, and auto-deploy on push to `main`.

**Architecture:** An Oracle Cloud "Always Free" ARM VPS runs `api`, `consumer`, `rabbitmq`, `redis`, and a new `caddy` reverse proxy via a standalone `compose.prod.yml`. Postgres moves to the Supabase project already used for avatar Storage. A DuckDNS subdomain points at the VPS's static IP; Caddy handles TLS automatically. A new `deploy.yml` GitHub Actions workflow SSHes in and redeploys on every successful `main` build.

**Tech Stack:** Docker Compose, Caddy (reverse proxy + automatic TLS), Oracle Cloud Ampere A1 (ARM), Supabase Postgres (pgvector), DuckDNS, GitHub Actions (`workflow_run`, SSH deploy).

**Spec:** `docs/superpowers/specs/2026-08-24-production-deployment-design.md`

## Execution Model

Tasks 1-3 require the operator's own browser session, account credentials, and (for Oracle) a payment method for identity verification. No agent can complete these unattended. Each of those tasks is written as an exact runbook: precise settings to choose, exact commands to run once access exists. Tasks 4-6 are ordinary repo changes plus SSH/`gh` CLI commands, and can be executed by an agent once given the VPS's IP/SSH access and the values Tasks 1-3 produced (domain, Supabase connection string).

Practically: an operator (the user) drives Tasks 1-3 and hands the results to whoever runs Tasks 4-6.

## Global Constraints

- $0/month recurring cost: every choice in this plan follows the spec's free-tier decisions (Oracle Always Free, Supabase free tier, DuckDNS, Cloudflare Pages already in place for the frontend).
- No application code changes. Every file this plan creates is new infrastructure config (`compose.prod.yml`, `Caddyfile`, `.github/workflows/deploy.yml`); nothing in `src/` or `anime-verse-backend/{api,lib,consumer.ts}` changes.
- Commit messages: plain, direct, no conventional-commit prefixes (`feat:`, `fix:`, etc.), no AI attribution, matching this repo's existing convention.
- `.env.production` never gets committed (already gitignored): it's populated directly on the VPS, not through git.
- Backend TypeScript/config file conventions (4-space indent) don't apply here since no `.ts` files change, but YAML files in this plan (`compose.prod.yml`, `deploy.yml`, `Caddyfile`) should match this repo's existing 2-space YAML indent (see `.github/workflows/ci.yml`, `compose.yml`).

---

### Task 1: Provision the VPS

**Files:** None. This task is entirely in the Oracle Cloud console and SSH, no repo changes.

**Interfaces:**
- Produces: a reachable Ubuntu ARM VM with a static public IP, Docker Engine + Compose plugin installed, ports 22/80/443 open. Every later task depends on having this IP and SSH access.

Oracle requires a credit card on file for identity verification even for the Always Free tier. No charge occurs as long as usage stays within Always Free limits, but the signup flow will ask for one.

- [ ] **Step 1: Create the Oracle Cloud account**

Sign up at https://www.oracle.com/cloud/free/ if not already done. Choose a Home Region during signup; this is permanent for the account, so prefer a region reported as having available Ampere A1 capacity (Frankfurt or Singapore, per the spec's "Alternatives Considered").

- [ ] **Step 2: Generate an SSH key pair for the VPS**

On your local machine:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/animeverse-vps -N ""
```
This produces `~/.ssh/animeverse-vps` (private key) and `~/.ssh/animeverse-vps.pub` (public key, used in Step 3).

- [ ] **Step 3: Create the compute instance**

In the Oracle Cloud console: Compute → Instances → Create Instance, with:
- **Name:** `animeverse-prod`
- **Image and shape:** Ubuntu 24.04, shape `VM.Standard.A1.Flex`, 2 OCPUs, 12 GB memory (the post-June-2026 Always Free allowance)
- **Networking:** create a new VCN if none exists, "Assign a public IPv4 address" checked
- **SSH keys:** upload the public key from Step 2 (`~/.ssh/animeverse-vps.pub`)
- **Boot volume:** default (50 GB) is fine

Click Create. If it fails with "Out of host capacity," this is Oracle's known Ampere A1 capacity constraint, not a configuration error. Retry the same settings in a different availability domain within the region, and if that region is consistently full, switch the instance's region to Singapore. If both are consistently full after real retries over a reasonable window, fall back to a GCP `e2-micro` instance instead (per the spec, this needs swap space configured given its 1 GB RAM; out of scope for this plan's steps, which assume Oracle succeeded).

- [ ] **Step 4: Open the firewall at both layers**

Oracle has two independent firewall layers, and both must allow 80/443 or nothing gets through:

In the console: the instance's VCN → Security Lists → default security list → Add Ingress Rules, for both `0.0.0.0/0` sources: destination port 80 (TCP) and 443 (TCP). Port 22 is open by default.

On the instance itself (Oracle's Ubuntu images ship with restrictive default `iptables` rules that block inbound traffic even after the Security List allows it):
```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> \
  'sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT && \
   sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT && \
   sudo netfilter-persistent save'
```

- [ ] **Step 5: Install Docker Engine and the Compose plugin**

```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> \
  'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu'
```
Log out and back in (or start a fresh SSH session) for the group change to take effect.

- [ ] **Step 6: Verify**

```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> 'docker --version && docker compose version'
```
Expected: both print version numbers with no permission errors.

Record `<INSTANCE_PUBLIC_IP>`: every later task needs it.

---

### Task 2: Point a domain at the VPS

**Files:** None. DuckDNS's own dashboard, no repo changes.

**Interfaces:**
- Consumes: `<INSTANCE_PUBLIC_IP>` from Task 1.
- Produces: a public hostname (e.g. `animeverse.duckdns.org`) resolving to the VPS. Task 4's `Caddyfile` and Task 5's secrets both need this hostname.

- [ ] **Step 1: Claim a DuckDNS subdomain**

Sign in at https://www.duckdns.org (GitHub or Google login), enter a subdomain name (e.g. `animeverse`) under "add domain," and confirm it's added to your list as `animeverse.duckdns.org`.

- [ ] **Step 2: Point it at the VPS**

In the DuckDNS dashboard, paste `<INSTANCE_PUBLIC_IP>` into the "current ip" field for `animeverse.duckdns.org` and save. Oracle's free VM keeps this IP for the instance's lifetime, so no dynamic-update script or cron job is needed; this is a one-time setting.

- [ ] **Step 3: Verify**

```bash
dig +short animeverse.duckdns.org
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

- [ ] **Step 2: Get the direct connection string**

In the Supabase dashboard: Project Settings → Database → Connection string → "URI" tab, **not** the "Transaction pooler" tab. Copy it (looks like `postgresql://postgres.<ref>:<password>@<host>:5432/postgres`). The VPS runs long-lived processes, not serverless functions, so the pooler's prepared-statement restrictions aren't worth taking on here.

- [ ] **Step 3: Apply the schema**

From `anime-verse-backend/` (any machine with the repo checked out and network access to Supabase; this worktree is fine):
```bash
POSTGRES_URL="<the connection string from Step 2>" npx prisma migrate deploy
```

- [ ] **Step 4: Verify**

```bash
POSTGRES_URL="<the connection string from Step 2>" npx prisma migrate status
```
Expected: `Database schema is up to date!` with all 5 existing migrations listed as applied.

Record the connection string from Step 2: Task 4's `.env.production` needs it.

---

### Task 4: Production Compose file, reverse proxy, and first manual deploy

**Files:**
- Create: `anime-verse-backend/compose.prod.yml`
- Create: `anime-verse-backend/Caddyfile`

**Interfaces:**
- Consumes: `<INSTANCE_PUBLIC_IP>` and SSH access from Task 1, the domain from Task 2, the Supabase connection string from Task 3.
- Produces: a running production stack reachable at `https://animeverse.duckdns.org`. Task 5's `deploy.yml` re-runs this same `docker compose` command on every push.

- [ ] **Step 1: Write `compose.prod.yml`**

This is a standalone production file, not a `-f compose.yml -f compose.prod.yml` override: `api` and `consumer` both declare `depends_on: postgres` and `depends_on: initdb` in `compose.yml`, and Compose starts a named service's dependencies regardless of which services are listed on the `up` command line. An override approach would drag `postgres`/`initdb` back in even though production doesn't run them. A standalone file that never mentions them sidesteps this.

Create `anime-verse-backend/compose.prod.yml`:
```yaml
services:
  api:
    build: .
    env_file: .env.production
    restart: unless-stopped
    healthcheck:
      test: [ "CMD", "node", "-e", "fetch('http://localhost:8000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" ]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on:
      rabbitmq:
        condition: service_healthy
        restart: true
      redis:
        condition: service_healthy
        restart: true

  consumer:
    build: .
    env_file: .env.production
    command: [ "sh", "-c", "npm run prestart && npx tsx consumer.ts" ]
    restart: unless-stopped
    healthcheck:
      test: [ "CMD", "node", "-e", "fetch('http://localhost:8001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" ]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on:
      rabbitmq:
        condition: service_healthy
        restart: true
      redis:
        condition: service_healthy
        restart: true

  rabbitmq:
    image: rabbitmq:4-management
    restart: unless-stopped
    healthcheck:
      test: [ "CMD", "rabbitmq-diagnostics", "ping" ]
      interval: 5s
      timeout: 10s
      retries: 5
      start_period: 10s

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
```
Unlike `compose.yml`, no service here publishes a host port except `caddy` (80/443). `rabbitmq`, `redis`, `api` (8000), and `consumer` (8001) stay reachable only from other containers on the compose-created network, matching the spec's firewall design.

- [ ] **Step 2: Write the Caddyfile**

Create `anime-verse-backend/Caddyfile` (replace `animeverse.duckdns.org` with the actual domain from Task 2):
```
animeverse.duckdns.org {
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
FRONTEND_URL=<the Cloudflare Pages URL for the frontend>
EOF
```
`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` from `.env.example` are omitted here on purpose: those only configure the official `postgres` image's own initialization, which `compose.prod.yml` doesn't run.

- [ ] **Step 4: First manual deploy**

```bash
ssh -i ~/.ssh/animeverse-vps ubuntu@<INSTANCE_PUBLIC_IP> \
  'cd ~/animeverse/anime-verse-backend && docker compose -f compose.prod.yml up -d --build'
```
Building happens natively on the ARM host, so Docker automatically pulls the correct architecture's manifest for `node:22-alpine`, `rabbitmq:4-management`, and `redis:7-alpine` with no cross-compilation step.

- [ ] **Step 5: Verify**

```bash
curl -sf https://animeverse.duckdns.org/health
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
gh secret set API_URL -b"https://animeverse.duckdns.org"
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

1. `curl -sf https://animeverse.duckdns.org/health`, expect 200.
2. Sign up for a new account through the deployed frontend (Cloudflare Pages URL), confirm login round-trips against the real Supabase Postgres.
3. Upload an avatar from the profile page, confirm the "Generating thumbnail..." state resolves once `consumer` finishes processing it (checks the full RabbitMQ → `consumer` → Supabase Storage path end to end).
4. `gh run list --workflow=deploy.yml --limit 1` after merging to `main` and pushing a trivial follow-up commit, confirming it ran and succeeded.

All four must pass before considering this deployment live. `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` in `.env.example` remain accurate for local dev (`compose.yml` is untouched) but are correctly absent from the production `.env.production` written in Task 4.
