# Local iMac Docker readiness and noon KST collection

The supplied Docker configuration is an **infrastructure scaffold**. It has a guarded ingest pipeline but **does not fetch public notices or upload records until an approved feed and Cloudflare ingest credentials are configured**. Do not interpret a running container as successful ingestion.

## Step 1: verify Docker on the iMac
Open macOS Terminal and execute:

```sh
docker version
docker info
docker compose version
```

Docker Desktop must be running. A client-only version or daemon connection error means the engine is not ready. If needed, open Docker Desktop and retry.

## Step 2: get project and inspect configuration
```sh
git clone https://github.com/heewon-yu/policy-benefit-matcher.git
cd policy-benefit-matcher
docker compose config
```
Use `git pull` instead if you have already cloned the project.

## Step 3: test a one-off container without scheduling
```sh
docker compose run --rm --no-deps collector python -c "import sys; from zoneinfo import ZoneInfo; print(sys.version); print(ZoneInfo('Asia/Seoul'))"
```

## Step 4: Ollama (optional for this test)
If Ollama is installed on the Mac, run `ollama list`, then:
```sh
docker compose run --rm --no-deps collector python diagnostics.py
```
Local Ollama on Apple Silicon can run natively for Metal acceleration. Host/container networking may need configuration. Do not expose Ollama to the public internet.

## Step 5: verify local Ollama inference against a fictional notice
```sh
git pull
docker compose run --rm --no-deps -e OLLAMA_MODEL=qwen3:4b collector python ollama_smoke_test.py
```

The test returns PASS only if the local model correctly extracts four fields from a **fictional** example. It makes no government API calls and does not upload data. A FAIL is a signal to tune prompt/schema handling; it does not mean Docker connectivity failed.

## Step 6: start the idle scheduler only when ready
```sh
docker compose up -d
docker compose logs -f collector
```
You should see the next **12:00 Asia/Seoul** attempt. When it fires without SOURCE_FEED_URL, INGEST_URL, or INGEST_TOKEN, it safely skips collection. It does not report false success.

```sh
docker compose down
```

## Operational notes
- The Docker Desktop engine and iMac must be awake at the scheduled time.
- A macOS laptop sleep or Docker shutdown prevents execution; missed runs are not automatically replayed in this scaffold.
- The scheduled collection will require source adapters, parsing validation, and an authenticated Cloudflare Worker ingest endpoint before activation.
- No GitHub Actions jobs are used.

## Verification log — user-provided terminal output (2026-11-19)
- Docker Desktop 4.99.0, Engine 29.9.3, Compose 5.7.0, Apple Silicon arm64: confirmed operational.
- Private GitHub repository cloned to iMac, Docker Compose config rendered: confirmed.
- Collector unittest: 4 tests passed.
- Docker-to-native Ollama connection: confirmed, model list includes qwen3:4b (Ollama 0.40.16).
- **Not yet verified**: actual Ollama generation, real government API ingestion, Worker/D1 deployment, noon schedule unattended run.
