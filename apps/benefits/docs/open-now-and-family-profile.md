# Open-now catalog and local household profile (P0)

## Selection rules

The Worker GET `/api/programs` defaults to `availability=open`. Only public notices with explicit `ROLLING` application windows or dated application periods (`start_date <= today <= end_date`, Asia/Seoul) are displayed. Future or past application dates are excluded. A notice marked as open does **not** guarantee eligibility or remaining budget; always provide the official link.

`availability=review` additionally includes notices whose application date is unknown, without showing *known* expired or future notices. The UI labels these as **접수기간 미확인**; this is an explicit optional switch, not the default. Public API results are not user-specific; no private profile is transmitted.

The Government24 source `신청기한` is normalized only when it explicitly says `상시` / `연중` or has a clear two-date interval. A missing date is **UNKNOWN**, never assumed open. The list-only bootstrap intentionally retains unknown entries in D1 as a reference catalog but hides them from default discovery. Detail enrichment remains bounded by official quota.

Bizinfo notices with a provably expired end date or future start date are skipped by the collector. Undated notices are retained for manual review but not published as currently open. If all notices in the collected bounded window are explicitly closed/future, returning zero currently-open notices is valid, not a retryable error. Bizinfo is bounded to five pages × 100 source items; this is **not a proven full inventory**.

When the source publishes no explicit window, an operator must check the official notice before changing its open status. Avoid AI-inferred dates.

## Local profile fields

Stored only in `localStorage`:
- Existing: applicant type, region, birth year, household size, middle-income ratio, business start date, annual revenue
- Added: number of children, children's birth years (comma-separated), expecting a child, marital status, owner/monthly rent/jeonse, employment/student/job-seeking status

Family-specific sorting uses transparent title/summary keyword relevance. It **does not** infer eligibility from having children or being pregnant. Unreviewed source age and region codes cannot automatically mark a family ineligible. The match badge explicitly requires review if source conditions remain unverified.

The UI includes a manual option to display unknown application windows and an option to hide programs with *verified* mismatching personal criteria. Saved favorites are local only.

## Deployment requirements

Code changes on GitHub do not automatically update the already deployed Worker. After unit tests and TypeScript checks pass, manually deploy `worker` via Wrangler; verify `/api/health`, `/api/programs?availability=open`, and `/api/programs?availability=review` before deploying the website.

The Vercel server proxy and staged Cloudflare Pages proxy both forward the availability parameter. Vercel rebuild and `dailyfoodfighter.com/benefits/` integration must wait for the agreed P0 → P1 milestone. Do not start GitHub Actions.

**Current status:** previously confirmed D1 connection + three Gov24 rows, as of 2026-11-19; Bizinfo successful upload remains unverified from the user's latest truncated terminal output. Frontend/Worker changes in this document are GitHub code only until deployed and tested.
