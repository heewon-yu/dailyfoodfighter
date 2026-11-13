# Scalping King: production deployment runbook
Status: NOT DEPLOYED — required manual console steps, 2026-11-13.
Review PR #5 checks and confirm release readiness before merging. Do not use development credentials for production.

## 1. Cloudflare Pages + D1
1. Identify the Pages project serving `dailyfoodfighter.com`. Confirm it is the same deployment that serves `/api/scalping/*` Functions. Do not assume because the blog is online that D1 routes have been published.
2. Verify `DB` is bound to the **correct** D1 database in production and preview. Back up the database before migration. Production `functions/_shared/scalping.js` expects `env.DB` (not just `SCALPING_DB`).
3. Apply `functions/api/scalping/schema.sql` if the original table is absent; then apply `functions/api/scalping/migrations/0002_verified_rounds.sql` against the selected D1 database **once**, after reviewing SQL and backups. Do not recreate/overwrite existing production tables.
4. Confirm `/api/scalping/rankings` returns the expected JSON. The API must reject POST bodies with client-controlled `nickname`, `rate` or `profit` (400); do not post destructive sample data to the production service.
5. Confirm an authorized test player can register, start a round, submit commands, finish a complete timed round and appear in rankings; do this in preview/staging before live.
6. Verify the new verified-score API has been deployed **before distributing the Android binary**. Android's official client targets `https://dailyfoodfighter.com/api/scalping`.
7. Review account deletion, profile/token persistence, nickname duplicates, consent, breach logging and data retention on the real D1 database.

## 2. Cleanup scheduler (disabled by default)
- A GitHub Actions workflow `.github/workflows/scalping-retention.yml` runs at 01:20 KST only after enabling repository variable `SCALPING_RETENTION_ENABLED=true`.
- Generate a cryptographically random **lowercase 64-character hex** token securely; never commit or share it in chat.
- Store the token as GitHub Actions secret `SCALPING_D1_MAINTENANCE_TOKEN`.
- Store SHA-256 hex digest of the same token in Cloudflare Pages encrypted secret `SCALPING_D1_MAINTENANCE_DIGEST`.
- Test the endpoint and SQL/backup behavior in preview before enabling the repository variable; enable only after the migration is live and verified.
- The cleanup deletes legacy `daily_rankings` rows older than the KST yesterday cutoff, along with old sessions/quotas and time-limited ad/security records; verify actual legal/operational retention requirements before announcing dates.

## 3. AdMob and SSV
1. In AdMob, confirm Android app ID, each unique rewarded ad unit, associated account, restrictions and policies. The existing Android README references IDs but do not treat them as approved ad serving status.
2. Configure each unit's SSV callback to `https://dailyfoodfighter.com/api/scalping/admob`; ensure callback signature verification works with genuine callbacks. Distinct placement names: credit / emergency / stop / extra.
3. Use production `SCALP_ADMOB_APP_ID`, `SCALP_ADMOB_REWARDED_ID`, `SCALP_ADMOB_EMERGENCY_ID`, `SCALP_ADMOB_STOP_ID`, `SCALP_ADMOB_EXTRA_ID` in the **trusted release build environment** only.
4. Verify consent/UMP and privacy options, ad cancellation, no availability, retry, verified granting, duplicate callbacks, and timeout, on an authorized test Android device.
5. Reject Google test IDs in release and ensure all units belong to the same publisher; never embed credentials or signing secrets in source.

## 4. Android signing and Google Play
1. Confirm Play Console app package exactly `com.dailyfoodfighter.scalpingking`.
2. Review `.github/workflows/scalping-android.yml`, its signing secret names, and CI artifacts before using them. The default AAB may be unsigned and/or not include production ads.
3. Create/store Play upload key securely, use Play App Signing, and submit a **signed** release AAB. Verify versionCode increase, installation and update from Play internal track.
4. Confirm launcher icon, adaptive icon, graphics and five screenshots match the approved 01 design and actual current game. Don't replace assets from synthetic artwork without the owner's approved originals.
5. Publish an app-specific Korean privacy policy, verify SDK data flows, app data deletion process, account/age declaration, Ads/Data Safety/Financial Features declarations, then configure test track and production releases.
6. Test on real Android devices: boot without network, data switch, navigation/back button, keyboard, system bars, foldable/rotation, interruptions, reward flow, 5-minute finish, verified daily leaderboard, and app updates.
7. Account-specific closed testing requirements must be checked inside Google Play Console. Do not treat developer account approval as production approval.

## 5. Rollback
- Do not deploy an Android app that relies on the verified endpoints before migration and server deployment.
- If deployment breaks, stop the Play rollout, restore the previously known-good Android artifact/site version, keep production database backup, and disable retention via repo variable.
- Avoid destructive schema rollbacks after scores or ad callbacks have been written. Prefer forward fixes with audited migrations.
