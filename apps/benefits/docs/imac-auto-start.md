# iMac M1 collector autostart, noon refresh and missed-run recovery

## What "automatic" means

The iMac must be powered on, logged in (for Docker Desktop to launch), awake, online, and running the Compose service. A powered-on iMac can still be asleep or have Docker Desktop stopped.

Set **Docker Desktop → Settings → General → Start Docker Desktop when you sign in to your computer** to ON. Docker documentation: https://docs.docker.com/desktop/settings-and-maintenance/settings/

The Compose service already has `restart: unless-stopped`, which tells Docker Engine to bring back a running service when its engine restarts. It **does not** start a service you never created with `docker compose up -d`, and a service manually stopped with `docker stop` might not auto-restart. Docker documentation: https://docs.docker.com/engine/containers/start-containers-automatically/

Check macOS **System Settings → Lock Screen → Turn display off...** and Power/Energy options separately. **Display sleep is fine; system sleep is not** for a noon network collection. Avoid unnecessary security changes or disabling the display lock. Docker Desktop starts when the user signs in, not necessarily before the macOS login screen.

## Before enabling production

1. Complete D1 migration, Cloudflare Worker deployment, Worker ingest token, and a **manual** initial ingestion per [P0 runbook](p0-cloudflare-release.md).
2. Validate `/api/health` returns storage connected, and that the browser displays actual public notices.
3. In the local project root `.env`, set `COLLECTOR_SOURCE=all`, `INGEST_URL`, `INGEST_TOKEN`, and preserve both API keys. Secrets must never be pasted into chat or GitHub.
4. Keep `OLLAMA_MAX_RECORDS=0` until performance and extraction accuracy are independently tested.

## Activate after P0 validation

```sh
cd ~/policy-benefit-matcher
git pull
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
docker compose up -d collector
docker compose ps
docker compose logs --tail=30 collector
```

Do not use `docker compose config` in a shared transcript; it renders the secret-bearing environment.

`docker compose up -d collector` must be run once with correct configuration. If you edit `.env` after the container is already running, run **`docker compose up -d --force-recreate collector`** after checking what changed; Docker Compose only passes environment settings at container creation.

## Exactly when does collection run?

The scheduler uses **Asia/Seoul noon**, independent of the host display time zone:

- At noon, when the latest successful scheduled run is older than today's noon.
- On Docker restart after a missed noon, once immediately, then back to the next noon.
- When starting for the first time, it performs one initial sync after the external sources and ingestion endpoint are all configured.
- If the last missed run is recovered in the morning, the noon run is **still scheduled** that day.
- After a successful upload, it persists a date in the `collector-state` Docker volume and will not upload twice for the same scheduled date.
- After failed upload, the checkpoint remains unchanged and the scheduler retries with an interval of at least 30 minutes. It never marks failed uploads as successful.
- If no API keys or Worker ingest connection are configured, it skips collection rather than attempting to access data.

If the Mac was offline for multiple days, it performs a catch-up run using **current official API data**. It cannot guarantee recovery of expired/removed historical notices.

## Safe health and checkpoint inspection

```sh
cd ~/policy-benefit-matcher
docker compose ps
docker compose logs --tail=30 collector
docker compose exec collector python status.py
```

The status command prints the next due time and last successful scheduled date from the persisted volume, without showing credentials.

## Stop / resume

To stop automatic refresh explicitly:
```sh
docker compose stop collector
```

To resume:
```sh
docker compose up -d collector
```

No GitHub Actions, Vercel cron, or Cloudflare scheduled jobs are used for the collector.
