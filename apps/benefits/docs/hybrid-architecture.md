# Hybrid architecture: iMac M1 + Docker/Ollama + Cloudflare

Status: architecture proposal only; not yet deployed.

## Responsibilities
- iMac M1 Docker: scheduled Python public API / permitted crawler collection; normalization, deduplication and logging.
- Local Ollama: JSON extraction for changed, ambiguous public program text. Validate all model output, flag uncertainties for review.
- Cloudflare Workers + D1: secured ingestion endpoint, persistent program records, public read-only search and matching API.
- Frontend: browser fetches latest stored records, independent of the Mac being online.

## Data flow
Official API / permitted site -> Python collector -> deterministic parsing -> selective Ollama -> schema validator -> HTTPS authenticated Worker ingest -> D1 -> Worker read API -> website / Android.

## Freshness rules
- Website reads current D1 records per request; that is not the same as instant detection of new government announcements.
- Confirmed schedule: once daily at 12:00 Asia/Seoul (03:00 UTC), subject to official API quota and terms. Notices published after noon may not appear until the next day's run.
- Show record source, retrieval time and official application link.
- Mac outage does not take website offline; it prevents new collection. Monitor stale records.
- Deduplicate by source and source_id and upsert only changed entries.

## Security and operations
- Do not expose Ollama port or Cloudflare write secret publicly.
- Keep user profile data out of collector and LLM entirely.
- Use low-privilege ingest credential, small bounded batches, retries and audit logs.
- Honor robots.txt, terms and API rate limits; prefer official APIs.
- Benchmark Ollama natively on Apple Silicon versus Docker deployment; hardware memory constrains feasible model size.
- D1 free tier has enforced limits, so use indexed reads, pagination and conservative writes.

## Scheduler specification
- Target timezone: Asia/Seoul. Daily run: 12:00 KST.
- If a UTC-based cron is used: `0 3 * * *`. In a timezone-aware local scheduler use `TZ=Asia/Seoul` and noon directly.
- Preferred: host-side or dedicated Docker scheduler using timezone-aware configuration, persist run state, and prevent overlapping runs.
- Run once upon explicit manual test and validate result before enabling automatic scheduled work.
- Docker is installed on the target iMac according to the owner but engine health is not yet verified. Use `docker version`, `docker info`, and `docker compose version`; do not assume Docker daemon is running.

## Next implementation tasks
1. Docker compose and Python source adapters.
2. Pydantic JSON contract and model-output validation.
3. D1 schema + authenticated ingestion Worker.
4. Public API, match tests, mobile web UI.
5. Monitoring and deployment tests without GitHub Actions.
