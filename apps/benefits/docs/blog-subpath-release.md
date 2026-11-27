# Publish the benefits app under DailyFoodFighter /benefits/

**Status: static blog build validated on iMac (2026-11-19), NOT deployed to production blog.** Do not change the production blog until Cloudflare D1/Worker ingestion passes P0 checks. Existing live game paths must remain untouched.

The marketing site is a Jekyll project in `heewon-yu/dailyfoodfighter`, with static games at `games/300-seconds/` and `games/scalping-king/`. The benefits app lives in the **separate private** repository `heewon-yu/policy-benefit-matcher`.

## Design

```text
dailyfoodfighter.com/
  /                        existing Jekyll blog (untouched)
  /games/300-seconds/      existing game (untouched)
  /games/scalping-king/    existing game (untouched)
  /benefits/               SvelteKit static export, base path /benefits
  /benefits/privacy/       privacy draft
  /benefits/app/           app assets (not _app; compatible with Jekyll)
  /benefits/api/programs   same-origin Cloudflare Pages Function
                                  ↓ HTTPS
                       policy-benefit-api Worker
                                  ↓
                         Cloudflare D1 (public notices)
```

## Safe one-time release procedure after P0 data is operational

1. In the benefits repository on the iMac run `npm install`, `npm run check`, then `npm run build:blog`. This uses a **separate** static adapter; the Vercel UI build continues to use `npm run build`. GitHub Actions are not involved.
2. Verify **real HTML outputs** `build/index.html` and `build/privacy/index.html` plus `build/app/` exist. Build must fail rather than produce only `200.html`. Check localhost preview with the `/benefits/` prefix. If the outputs differ, stop and fix before copying.
3. In a **separate checkout** of the blog repository, copy the static build output inside `benefits/`, preserving the generated `app/` asset directory. Do not overwrite site root, `games/`, posts, or blog functions.
4. Copy the **staged and reviewed** function at `deploy/blog/functions/benefits/api/programs.ts` to `dailyfoodfighter/functions/benefits/api/programs.ts`. This route never accesses visitor profiles and forwards only public GET parameters.
5. Configure the **blog Cloudflare Pages project** environment variable `BENEFITS_WORKER_ORIGIN=https://<actual-worker-hostname>/` (no secret required). Confirm the host resolves to the previously deployed Worker and not an unrelated service. Do not expose API keys or ingest tokens.
6. Test the generated static HTML and Pages Function in a preview deployment. Check the blog homepage and both games for regressions.
7. Merge/push the blog repository **once at the P0 → P1 milestone** and confirm `https://dailyfoodfighter.com/benefits/` and `/benefits/api/programs` show real public notices.
8. Keep Vercel only as a fallback/preview during migration, then decide whether to retire the Vercel project separately.

## Caveats

- The static export **passed** `npm run build:blog` on the user's iMac on 2026-11-19 (Svelte check: 0 errors/0 warnings, adapter-static wrote `build/`). This does **not** confirm that the generated directory layout matches the Jekyll deployment root or that Pages Functions work in production.
- The existing blog build process might exclude folders or Cloudflare Functions based on project configuration. Verify in the Pages preview; never replace the blog Jekyll build command or the root `_site` folder blindly.
- The static bundle uses `/benefits` as the SvelteKit base path. Avoid redirecting /benefits/* to another domain or using an iframe: the goal is a native path on the same domain.
- Search and saved items run in the browser, but public program GET requests go to a same-origin Pages Function.
- Blog JavaScript/CSS and benefits app assets must remain namespace-isolated; existing pages are unchanged.

## 2026-11-19 static export regression and remedy

An iMac `npm run build:blog` originally succeeded but output only `build/200.html` and assets; **no** `build/index.html` or `build/privacy/index.html` existed. Thus this build was **not publish-ready**. Code now declares `export const prerender = true` for public pages and uses strict static adapter **without SPA fallback**. To validate, pull new main and run `npm run build:blog`, then `test -f build/index.html && test -f build/privacy/index.html && test -d build/app`. Do not publish the former fallback-only output. Existing blog and game paths stay untouched.

## 2026-11-19 API route and static adapter fix

When public pages were marked for prerendering, `adapter-static({ strict:true })` correctly reported the separate dynamic `/api/programs` SvelteKit route as not exportable and failed the blog build. This endpoint is **intentionally** replaced in the deployed blog by `functions/benefits/api/programs.ts`, so blog export now uses `strict:false` **with a mandatory post-build assertion** (`scripts/verify-blog-build.mjs`). The assertion requires `build/index.html`, `build/privacy/index.html` and generated `build/app/immutable` assets and nonempty expected page content. Any missing HTML still fails the build. Normal Vercel mode continues to use adapter-auto and its server endpoint. This fix is committed but needs a new iMac build result; do not treat GitHub commit as proven deployed.
