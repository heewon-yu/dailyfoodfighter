# Government24 public-benefits API integration — read-only validation

Official [public data portal page](https://www.data.go.kr/data/15113968/openapi.do) and [Swagger contract](https://infuser.odcloud.kr/api/stages/44436/api-docs?1684891964110).

- GET `https://api.odcloud.kr/api/gov24/v3/serviceList` for public benefits.
- GET `/gov24/v3/serviceDetail` using `cond[서비스ID::EQ]` for detail.
- GET `/gov24/v3/supportConditions` using the same ID for eligibility flags.
- Each call uses a locally held `serviceKey`, `page`, `perPage`, and `returnType=JSON`.

Gov24 support flags `JA0110`/`JA0111` are candidate age bounds. `JA0201`–`JA0205` are **income brackets, not precise upper thresholds**; they are stored as source flags without turning them into unjustified percentages. Family and life-stage codes including pregnancy/childbirth flags are retained as raw eligibility metadata. Regional rules are not assumed from ministry names; service eligibility always requires original review.

## First local test (iMac)

The project already has a local `.env`. Add **one** line inside that existing file (do not create duplicates):

```ini
GOV24_API_KEY=your-own-decoded-service-key
```

Keep the real key only on the Mac. Do not paste it into chat or GitHub; do not paste `docker compose config` output because environment variables can contain the secret. Do not start `docker compose up -d` yet.

```sh
cd ~/policy-benefit-matcher
git pull
nano .env
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
docker compose run --rm --no-deps collector python gov24_diagnostics.py
```

The diagnostic calls only a tiny public sample (about 6 API requests), prints row counts, public field names and a few names, and does **not** upload to Cloudflare. The output can be shared after checking it contains no secret.

## When diagnostics pass

```sh
docker compose run --rm --no-deps collector python gov24.py
```

The default test reads five list rows and enriches one. If your account uses a URL-encoded key, use the **decoded** service key value in `.env` so that `urllib.parse.urlencode` encodes it exactly once.

## Collector configuration

Set `COLLECTOR_SOURCE=gov24` for Gov24 only, `bizinfo` for the approved business program feed or `all` for both (requires both keys and a configured Cloudflare ingest endpoint). Gov24 defaults: one page × 10 records and max 5 detail/conditions lookups. Increase bounds only after API limits and legal terms are understood.

The scheduler remains at **12:00 Asia/Seoul** and will not upload records until the Worker endpoint and secret exist. `OLLAMA_MAX_RECORDS=0` disables per-record local AI by default after a measured ~154.5-second synthetic inference; cap is 3 records when explicitly enabled.

### Not yet verified
The user's iMac **successfully verified the three live Gov24 endpoints** on 2026-11-19. Full crawling, long-term operations, full mapping/accuracy, D1 ingestion and daily noon automation are still unverified. The Korean Social Security Information Service welfare dataset is a separate file dataset and is not part of this API adapter.

## 2026-11-19 milestone: live three-endpoint verification

User-provided iMac results from `gov24_diagnostics.py`:

- List: **3 records**, reported total **10,887** (API reported value; not confirmed all distinct/current/eligible).
- Details: **1 record**; support conditions: **1 record** for one sampled service ID.
- Normalized: **3 records**, `PASS: Gov24 adapter read-only connectivity and normalization`.
- Example service IDs and names: `105100000001` 근로·자녀장려금, `116010000001` 주택금융공사 월세자금보증, `119200000001` 친환경 에너지절감장비 보급.
- Actual live list fields include `서비스ID`, `서비스명`, `상세조회URL`, `지원대상`, `지원내용`, `신청기한`, `소관기관명`. Details include `온라인신청사이트URL`; conditions include `JA0110`, `JA0111`, `JA0201`–`JA0205`, other JA flags.
- The 3-record diagnostic and local test are **read-only**, with no D1 upload.
- Business-source Bizinfo previously returned 500 public notices; keep the sources separate, deduplicating only with verified identifiers or original links and evidence.

Next engineering milestone: paginated Gov24 collection within approved quotas, ID/hash diffing and targeted detail/conditions refresh, application deadlines and locality validation, cost-bounded Ollama, D1 ingest integration and operational checks. Do not enable unattended scheduling yet.
