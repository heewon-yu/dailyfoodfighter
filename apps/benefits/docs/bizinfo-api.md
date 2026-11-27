# Official API integration: Bizinfo

## Verified source
Official [Bizinfo support-program API specification](https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi) describes:
- GET `https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do`
- Required authentication parameter: `crtfcKey` (apply through Bizinfo).
- Optional: `dataType=json`, `searchCnt`, `pageUnit`, `pageIndex`.
- Response: `jsonArray.item`; fields `pblancId`, `pblancNm`, `pblancUrl`, `jrsdInsttNm`, `bsnsSumryCn`, `trgetNm`, `reqstBeginEndDe`.

The separate data.go.kr API [15157820](https://www.data.go.kr/data/15157820/openapi.do) states public-content license **source attribution, no modification (type 3)** and development/production access differences. Do not assume these two API offerings share identical authorization or licensing terms. Before commercial launch, check which license applies to the chosen source and whether AI rewriting/normalization/public republishing is permitted. Retain original links and attribution.

## Added implementation
`collector/bizinfo.py` parses the documented Bizinfo JSON response, validates original Bizinfo links, maps notice IDs, parses dates, preserves uncertain eligibility metadata, and avoids inventing grants, income thresholds or regions. A capped page count and payload size prevent unbounded requests. `collector/tests/test_bizinfo.py` contains synthetic tests.

`collector/pipeline.py` chooses an adapter by `COLLECTOR_SOURCE`:
- `normalized_feed` (default): explicitly configured approved HTTPS JSON feed.
- `bizinfo`: official Bizinfo adapter requiring `BIZINFO_API_KEY`.

`collector/scheduler.py` does **not** send requests without configured source credentials and Cloudflare ingest endpoint/token.

## Set up after approval
Copy `.env.example` to a local `.env`; set `COLLECTOR_SOURCE=bizinfo`, `BIZINFO_API_KEY=<service key>`, `INGEST_URL=https://<your-worker-domain>/api/ingest`, and `INGEST_TOKEN=<secret>`. Do not commit the real secrets. Leave unset while backend is not yet deployed.

Test parser offline:
```sh
git pull
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
```

The scheduled run is **daily at 12:00 Asia/Seoul**. The Python collector source mapping is implemented, and live authorized API retrieval has been verified with 500 records (see milestone below). Cloudflare Worker has not been deployed, and no scheduled operation has been confirmed.

## Current limitations
- Bizinfo only; welfare/Gov24 API requires a distinct adapter and appropriate API approval.
- Supports the documented JSON format only, and fails closed on incompatible responses.
- Limit first five pages × 100 rows; extend with quota-aware pagination after actual API verification.
- More rigorous date/status classification, eligibility parsing evaluation, idempotent upsert accounting, backoff and run-state monitoring are pending.
- API keys must remain locally secret; approval and access were successful for the verified iMac test, but production use rights still require checking.

## 2026-11-19 milestone: live API read verified
- User's iMac ran Docker collector unit tests: **11/11 passed**.
- Live authenticated Bizinfo API retrieval succeeded and returned **500 normalized records**. Sample: `[경기] 구리시 2026년 농산물유통사업 물류비 지원 신청 공고`, official link `https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000128009`.
- **500 is the configured collector cap** (5 pages × 100), not verified as all available notices.
- Local Qwen3 4B synthetic-notice extraction: **PASS** for 4 expected fields after 154.5 seconds. One earlier attempt timed out at 180 seconds.
- No operational D1 upload or automatic noon run has yet been verified. Never put API key in GitHub.
- Next major phase: incremental diffing by source/id/content hash, bounded AI calls on changed notices only, allow manual review, improve throughput and paging, verify official licensing, then D1 end-to-end integration.
