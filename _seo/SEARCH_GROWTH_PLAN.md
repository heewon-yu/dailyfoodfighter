# Search growth handoff — 2026-11-25

Goal: qualified non-brand organic clicks; priority query-page pairs in top 10, then top 3. No ranking guarantee. Do not generate bulk low-value pages or fake authors, reviews or traffic.

Baseline audit of main d2e2e98ea32711b0787af66e640d127ddd07b009: all 124 source files fetched, 62 language pairs, title/description/permalink present, 124 FAQ blocks, 112 ingredient nutrition fields, 12 hub posts. Eight pages matched the narrow direct DOI/PubMed/PMC/FDC link pattern; remaining 116 require citation review, not a declaration that no sources exist. Full scientific review is still open. Latest egg/tofu posts have serving tables and FDC IDs; verify all remaining body/FAQ claims.

Run locally (no new GitHub Actions):
- python3 _seo/audit_posts.py --root . --output /tmp/dff-post-audit.csv
- jekyll build (test Jekyll 3 and 4 where available)
- python3 _seo/audit_live.py --all
- audit rendered JSON-LD, canonical/hreflang reciprocity, real 404, redirects, all sitemap URLs, internal links, GA4 tag presence; inspect deployed status.
- GSC: use authorized Search Analytics API and URL Inspection API (read-only), export final 28/7-day query/page/country/device rows. No general-blog Indexing API or artificial clicks. GA4 organic landing-page sessions separate from CF requests.
- Prioritize observed impressions with position 4–20; optimize one intent per language/page. With no impressions check indexing first. Compare localized SERP top 10 manually, document query and date; validate demand via Trends/Keyword Planner or actual GSC data. Never invent volume.
- Candidate priorities (not verified volume): egg 1/2 calories/protein; tofu 150/300 g protein; chicken breast per 100g; sweet potato raw vs cooked; avocado ripeness; banana one serving; pork belly 100g raw/cooked; laver per sheet iodine; kelp broth iodine; cauliflower rice; cabbage raw/cooked; high-protein food comparison.
- High risk: all disease/medicine, iodine, GI/GL, nutrient loss, detox/anti-aging claims. Check exact primary source, food ID, sample and unit. Record changes in FAQ JSON-LD too. Do not assume low-carb foods have a measured GI. Keep existing URLs.
- Add nutrition calculator/compare feature only for verified food IDs and comparable edible-weight basis. Separate raw/cooked, Korean/US values, brands, serving sizes. Use static data, no D1, no paid API.
- Preserve map, games, benefits, AdSense, existing X schedule. Do not modify cron or credentials without authorization. Daily report must separate submitted/indexed, impressions/clicks/CTR, position, 7/28d trends, and failures. Use an actual baseline and keep a change log; do not fabricate SEO wins.

## Follow-up
- Calculator pages /nutrition-calculator/ and /en/nutrition-calculator/ added with five source-linked USDA foods, two-portion comparison and total, sitemap and links from nutrition posts. Validate production and calculator arithmetic before expanding. Reconcile chicken breast article basis versus calculator's different USDA entry; no silent substitutions.
- Korean carrot and squid titles and selected unsupported medical claims toned down. Remaining body and FAQ claims and English counterparts require review. Do not treat these partial edits as complete clinical validation.
- FAQ markup is not a ranking shortcut. Maintain visible FAQs for users; confirm current Google rich-result eligibility before investing further. Focus on actual impressions, clicks and qualified traffic.
- Run keyword mapping for all 62 pairs, use evidence from GSC/Trends and localized SERP observations; add specific portions, practical answers and source records, no mass duplicate articles. Track non-brand top 10 then top 3 by query, country and device, never promise rankings.

## P0 complete — 2026-11-25 (baseline: `_seo/p0_audit_baseline.md`)
- Full production audit, 144 sitemap URLs: all 200, no redirect chains, self-canonical, hreflang reciprocal, GA4/AdSense/viewport everywhere, 400 JSON-LD blocks parse clean, 144 internal link targets and 63 images all 200, negative URLs real 404 (no soft 404). Local Jekyll build not possible here (no ruby/jekyll in this environment).
- Fixed in `63e0659`: FAQPage question text aligned with rendered text (9 posts), unique descriptions for privacy/contact, chicken breast fat 2.6 → 1.24 g, calculator note that its chicken breast row is FDC 171077 (120 kcal/22.5 g) while the guide uses 110 kcal/23.1 g.
- Calculator verified in production: five foods match USDA FDC (143/12.56, 76/8.08, 120/22.5, 52/0.26, 89/1.09), formula g/100 with totals, 0–5000 g validation, bilingual UI, home ingredient search filters with alias mapping.
- GSC (data to 11-24): 7d 0 clicks/49 impressions/pos 46.9; 28d 3 clicks/962 impressions/0.3%/46.5. Indexed 53, not indexed 6 (report last updated 11-16) — 89 of 142 sitemap URLs were unknown to Google. 4–20 position candidates with 2+ impressions: palak keerai nutrients (5.7), protein in eggs (16.7), egg protein question variants (6.3–17), mackerel fishmeal (13.7), how many carbs in a banana (20).
- Redirect alert resolved as non-defect: the only URL is `https://dailyfoodfighter.com/en` (no slash), 308-normalized to `/en/` by Cloudflare Pages; nothing on the site links to it. Always submit indexing requests with the trailing slash.
- GA4: 28d 288 sessions, 79 engaged (27.4%), 13 s/session, 540 page views, 235 users, 2.30 views/user; organic 17 sessions (google 11, daum 5, bing 1), naver 0; 7d 61 sessions, organic 6. Calculator pages 0 views (deployed 11-25).
- Deployment incident: commits 09:44–09:54 carried `[skip ci]`, which makes Cloudflare Pages skip the build; production was stale until a normal-message push deployed them. **Never put `[skip ci]` in commit messages for this repo.**
- Next: `/en/nutrition-calculator/` indexing request (quota exhausted 11-25), chicken breast table source review, indexing coverage for broccoli en / onion kr / seafood category / en privacy, then 4–20 position query optimization.
