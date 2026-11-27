# Initial full catalog and daily new / updated / deleted synchronization

## Verified state (2026-11-19)
- User's Docker tests: **33 passed** (before new catalog-snapshot changes).
- Bizinfo public-program API: **500 notices read** during source smoke test, a configured 500-record cap, **not proof of complete historical inventory**.
- Gov24 three endpoints: live test passed; list API reported **10,887** available records at the test time. This is a reported count, **not evidence that all were loaded into D1**.
- Cloudflare D1 creation and public Worker deployment are **not yet completed**. No real catalog upload or delete has been performed.
- New snapshot archival and bootstrap code has **not yet been executed in the user's iMac/Docker runtime**.

## Intended lifecycle

| Phase | Action |
| --- | --- |
| First full bootstrap | Iterate all pages of Gov24 `serviceList`; persist each successful batch to D1; maintain resumable local cursor and inventory; fetch detail+conditions only within approved per-run limit |
| Next daily check | Revisit public listing pages to learn which IDs appeared or disappeared; compare normalized hashes to D1; upload **new or modified** records only |
| No change | Skip ingestion and AI; a source listing request may still be needed to verify that there is no change |
| First absence | Mark a **missing candidate** in the private local snapshot; keep the public record visible |
| Second full-scan absence | Mark a Gov24 record `ARCHIVED` in D1; it is hidden from public search but still reversible |
| Reappearance | Existing D1 hash checker treats archived rows as changed, reuploads and restores the row |

**A government API does not necessarily emit a deletion event.** Missing a record during one partial paginated scan is never enough evidence of deletion. The archive operation is gated by two distinct completed full scans and blocks mass deletion if the current inventory is unexpectedly smaller than 95% of its predecessor. This is still not proof of legal closure, so records are archived rather than hard-deleted.

**Important:** A full list of 10,887 Gov24 services may require ~109 list API pages at 100/page, plus optional details/conditions calls. Under the conservative default configuration, the first complete inventory takes multiple scheduled sessions, not one noon run. The full-list bootstrap can be invoked explicitly **only when the API quota and conditions permit**.

## Opt-in first full LIST scan — after D1 P0 readiness

First complete [D1 Worker deployment and health verification](p0-cloudflare-release.md). Verify official permitted quota, account's remaining request budget, and any rate limits. Ensure `.env` has the approved Gov24 key and **a working** `INGEST_URL` and `INGEST_TOKEN`.

The manual bootstrap checks for the exact environment variable `CONFIRM_GOV24_BULK_QUOTA=YES`, which is an operator attestation, **not proof** that the official quota permits the run. It reads up to 5 × 100 list rows per batch and at most five service details + five condition records in each batch, with a three-second inter-batch delay. It will stop after a maximum of 25 batches or at the first complete scan. Source identity is `GOV24` only, so the Bizinfo source is not needlessly fetched repeatedly.

```sh
cd ~/policy-benefit-matcher
git pull
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
docker compose run --rm --no-deps -e CONFIRM_GOV24_BULK_QUOTA=YES collector python bootstrap.py
```

**Do not run the bootstrap yet**, until all of the following are true: the Worker and D1 are deployed and manually verified, API full-scan request quota is confirmed, and the new unit tests pass. The default sample collector is safe without this explicit bulk flag.

The full scan initially provides **list-derived baseline records**; the detailed eligibility coverage remains partial while `GOV24_DETAIL_LIMIT` is small. Do not claim 100% complete support-condition classification. A later targeted enrichment queue should fill missing details and refresh source-changed records without hitting per-day quota caps.

## Operational limitations for the next milestone

1. **Daily full listing** is implemented behind the explicit `GOV24_DAILY_FULL_CATALOG=YES` opt-in, which also requires `CONFIRM_GOV24_BULK_QUOTA=YES`. The default noon scheduler still executes a bounded subset. Full daily traversal has **not been integration-tested against the live API and must remain OFF** until quotas and the first manual full scan are verified.
2. **Changed detail content** may not change a serviceList summary or its modification timestamp; a periodic refresh policy for details and conditions is required to detect this.
3. The Bizinfo feed is capped at 500 notices; **absence must never trigger deletion** for Bizinfo until its complete-inventory guarantee is verified.
4. No hard deletion occurs. Gov24 archive keeps the source record for audit/recovery.
5. Local `gov24-catalog-state.json` contains only official service IDs and checkpoint metadata, not user profiles or API keys.

## Current sync modes

- Default: at most 1 page × 10 services and 5 detailed conditions per successful noon run.
- Quota-approved manual initial list bootstrap: up to 25 iterations of 5 pages × 100 services, capped at 125 pages, resumable.
- Daily automated full list scan: **code prepared but OFF by default**; after successful P0 integration, approved limits, and manual bootstrap, it can be enabled with local `.env` values `GOV24_DAILY_FULL_CATALOG=YES` and `CONFIRM_GOV24_BULK_QUOTA=YES`, then recreate the collector container. A date checkpoint is marked successful only when both Gov24 full listing and Bizinfo updates finish.

## Important accuracy boundary

A full first **listing** pass is not synonymous with a full **details and support conditions** pass. The default cap enriches only five of 500 records per batch, so the initial catalog must retain review-required status. A follow-on detail refresh queue and source modification timestamp checks are necessary before treating detailed attributes as current. The daily complete list read (not only changed payloads) is necessary to detect deletion unless the provider offers a trusted change-feed API.
