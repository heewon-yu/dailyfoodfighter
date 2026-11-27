# Collector integration status and safeguards

## Implemented
- Python stdlib HTTPS JSON feed reader with an explicit SOURCE_FEED_URL requirement.
- Normalization, schema checks, SHA-256 checksums, optional local Ollama JSON extraction of public notices and small-batch authenticated Worker ingest.
- KST noon scheduler and basic unittest suite.
- No live source URL/API key is configured. Example feed must never be ingested into the production D1.

## Not yet implemented
- Government source-specific adapters: enterprise Bizinfo, public-benefits API, local welfare sources, pagination, rate limiting and robots/terms compliance checks.
- Deduplication against persisted hashes, failure retry, resumable checkpoints, missed-run catchup and source monitoring.
- Actual D1 migration and API deployment, real source testing, Ollama benchmarking, security review.

## Safety
- Collector doesn't need user profile data. Never collect login credentials, resident ID numbers, or uploaded user documents.
- No public notice is trusted merely because an LLM extracted a field.
- Configure an HTTPS URL only after checking source's official documentation and permission.
- Avoid exposing `INGEST_TOKEN` to the web frontend or logs.
- API keys stored only as local env / Cloudflare secrets.
