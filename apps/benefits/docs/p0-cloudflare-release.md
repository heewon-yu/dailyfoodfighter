# P0 — Cloudflare D1 + Worker + Vercel integration

This is the **remaining external-account step** for showing real government program records on https://policy-benefit-matcher.vercel.app. The UI is deployed. Bizinfo and Gov24 sample reads passed on the user's iMac; **D1 and Cloudflare Worker are not deployed yet**.

## Safety before starting
- Never put Bizinfo, Gov24 or ingest tokens in GitHub, a chat message or a public web URL.
- Cloudflare **D1 stores only public notice records**, not browser-local personal profiles.
- Do **not** start the unattended noon scheduler until manual upload and read verification succeed.
- Stop if `wrangler` reports the wrong Cloudflare account, existing unrelated database, or errors.

## Step 1 — iMac local checkout
```sh
cd ~/policy-benefit-matcher
git pull
cd worker
npm install
npx wrangler login
npx wrangler whoami
```
The login opens Cloudflare in a browser. Use the Cloudflare account that will own the database.

## Step 2 — create a NEW D1 database
```sh
npx wrangler d1 create policy-benefit-db
```
Copy the `database_id` UUID printed by Wrangler (not a secret) into this **existing file** `worker/wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`. Keep `binding = "DB"`, `database_name = "policy-benefit-db"`, and `migrations_dir = "../migrations"`.

Do not paste a whole `.env` file or credential into a terminal command shown in chat. You may report the non-secret D1 database ID and Worker hostname.

## Step 3 — run local database migration FIRST, then remote
```sh
npx wrangler d1 migrations apply policy-benefit-db --local
npx wrangler d1 migrations apply policy-benefit-db --remote
```
These create the `programs` and `ingestion_runs` tables on a new database. Remote migration is a persistent mutation; review the generated SQL in `../migrations/0001_initial.sql` first.

## Step 4 — deploy locked Worker, then register private ingest token
Deploy from `worker/`:
```sh
npx wrangler deploy
```
The new Worker starts with ingest **disabled** because no `INGEST_TOKEN` secret exists. After the first deployment, generate a unique random token locally (`openssl rand -hex 32`). Add it privately to the iMac project root `.env` as `INGEST_TOKEN`. Do not send the token in chat, commit it, or paste the `.env` contents into a log.

In the **worker/** directory run:
```sh
npx wrangler secret put INGEST_TOKEN
```
Enter the same token when Wrangler prompts for the secret value. Alternatively set it through **Workers & Pages → policy-benefit-api → Settings → Variables and Secrets** as a **Secret**, after the Worker exists.

Note the hostname ending in `.workers.dev`, e.g. `https://policy-benefit-api.<account-subdomain>.workers.dev`. Verify:
```sh
curl -sS https://<actual-worker-hostname>/api/health
```
Expect `{"status":"ok","storage":"connected"}`; `unavailable` means do not proceed.

## Step 5 — connect Vercel (server-side, not exposed in browser)
In **Vercel → policy-benefit-matcher → Settings → Environment Variables**, set:

```ini
WORKER_API_BASE_URL=https://<actual-worker-hostname>
```

Set for **Production** and redeploy the latest `main` commit. The SvelteKit server endpoint `/api/programs` forwards only public GET queries to the Cloudflare Worker, so no cross-origin CORS setting and no public-api keys are needed. The homepage will show a valid empty list until notices are ingested.

## Step 6 — manual first upload from iMac
In the existing **local** `.env`:
```ini
COLLECTOR_SOURCE=all
INGEST_URL=https://<actual-worker-hostname>/api/ingest
INGEST_TOKEN=<same-worker-secret>
OLLAMA_MAX_RECORDS=0
```
Retain the existing `BIZINFO_API_KEY` and `GOV24_API_KEY` entries. Never paste their values in a chat.

First dry-run the unit tests (no upload):
```sh
cd ~/policy-benefit-matcher
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
```
Then run **one manual collection** only after the Worker health check is green:
```sh
docker compose run --rm --no-deps collector python pipeline.py
```
The result reports `fetched`, `changed`, and `uploaded`. A second run may fetch a **different Gov24 page** because the scanner advances its cursor. Only after the same source records are revisited can unchanged hashes yield `changed: 0`. For Gov24, the default first-run sample is at most 10 list records and 5 detailed, not all 10,887 reported records. For a quota-approved resumable full-list initialization, see [full snapshot instructions](full-snapshot-sync.md).

## Step 7 — verify public view and decide whether to enable scheduler
```sh
curl -sS 'https://policy-benefit-matcher.vercel.app/api/programs?limit=3'
```
Check the homepage as well. If both show real programs and official HTTPS links, log a P0 milestone. Leave Docker scheduler OFF until checks for freshness, API quotas, regional eligibility, and data accuracy are reviewed. Then `docker compose up -d` can be approved separately.

## Troubleshooting
- `{"status":"unavailable"}` on /api/health: D1 binding/migration missing.
- `{"error":"public program database is not configured"}`: Vercel `WORKER_API_BASE_URL` missing or production not redeployed.
- 401 on ingest: secret mismatch, missing secret, or incorrect target Worker.
- 400 on ingest: malformed source record; review local parser.
- 503 on ingest: database schema/binding error.
- `D1 change-check response missing changed list`: deployed Worker is older than collector; deploy latest Worker first.
- No cards though API returns entries: inspect category/search filters and pagination.
- No local secret must ever appear in exported `docker compose config`, logs, screenshots, or shared files.

Official reference: https://developers.cloudflare.com/d1/wrangler-commands/

## New/modified/deleted safety

- New and modified notices are uploaded based on source ID and content hash.
- Gov24 complete-list scan membership is checkpointed in the Docker volume. Missing IDs are **not deleted** from a partial scan, even if a detail/URL parser rejected that item.
- Gov24 entries absent from two complete, non-anomalously-sized catalog scans are reversibly marked `ARCHIVED`. No hard deletions are performed.
- Bizinfo has a 500-notice configured collection cap; absence is not proof of deletion and never triggers archiving.
- The optional initial Gov24 full-list scanner (`bootstrap.py`) is not enabled automatically, and must be run only after API rate-limit approval. This still does not imply every service detail/condition is enriched.
