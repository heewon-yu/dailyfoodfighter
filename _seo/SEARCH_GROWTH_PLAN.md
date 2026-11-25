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
- Next: `/en/nutrition-calculator/` indexing request (quota exhausted 11-25), indexing coverage for broccoli en / onion kr / seafood category / en privacy, then 4–20 position query optimization.

## P1-1 complete — 2026-11-25 (124-post evidence audit + high-risk claim fixes)

Commits: `5f9a15b` (content fixes), `99df698` (audit table + scanner tools), plus this doc update. No `[skip ci]`.

**Deliverable: `_seo/content_audit_124.csv`** — 124 rows (62 pairs), 34 columns: file, URL, language, pair slug, category, title/H1, description length, answer-first paragraph text, serving-size table, per-100 g table, front-matter basis (`servingSize`), raw/cooked/dried state, FDC IDs, direct DOI/PubMed/FDC links, per-class high-risk counts (c1 treatment/cure/detox, c2 absorption multiples, c3 blanket safe intake, c4 raw–cooked mixing, c5 numeric GI/GL, c6 animal/in-vitro, c7 bare percentages), FAQ body vs JSON-LD divergence, review status, action taken, remaining check. Rebuild with `python3 _seo/p1_build_audit.py . _seo/content_audit_124.csv`; inspect every matched sentence with `python3 _seo/p1_dump_claims.py <files...>`.

Inventory (as of this pass): answer-first box 124/124, per-100 g table 124/124, serving-size table 59/124, source ID or direct reference link 30/124 (was 20/124), FAQ body–JSON-LD numeric conflict 15 rows, paraphrase-only difference 34 rows. Unqualified claim hits: c1 25, c2 26, c3 29, c5 (numeric GI/GL) 37, c6 26, c7 18. Review status: 수정완료 28 rows (14 pairs), 표현 완화 필요 14, 경미 검토 필요 40, 출처 ID 보강 필요 36, 구조·표현 양호 6.

Fixed in `5f9a15b` (28 source files + calculator include):
- **Chicken breast** — the 110 kcal / 23.1 g / 1.24 g basis did not match any single source: potassium 334 mg came from USDA FDC 171077 (raw) while B6 0.60, B12 0.34, P 228 and Se 27.6 came from FDC 171477 (cooked, roasted). Replaced the whole table with FDC 171077 (120 kcal, 22.5 g protein, 2.62 g fat, K 334, B6 0.81, B12 0.21, P 213, Se 22.8, water 73.9), recomputed every %DV, and added the Korean national entry (닭고기, 가슴, 생것, I008000D020a: 106 kcal, 22.97 g, 0.97 g) as a separately labelled sample. Calculator note now states both pages use FDC 171077.
- **Cabbage / broccoli / garlic / carrot** — treatment, cure, cancer-prevention and “liver detox” assertions narrowed to cell/animal evidence or removed; unsupported multiples (3×, 5×, 2×, 10×, 6,000×) deleted; invented analysed values (vitamin U 18.2 mg, glucosinolate 42 mg, saponin 65 mg) removed from tables; blanket “X g is safe” answers replaced with individual guidance; FDC IDs added where the numbers matched (carrot 170393, cabbage 169975, broccoli 170379).
- **Salmon / egg / tofu / spinach / avocado / oyster / shrimp / pork tenderloin / orange / banana** — quoted percentages and multiples tied to their study conditions (e.g. triglycerides 20–30% only at 2–4 g EPA+DHA/day), pork cooking answer corrected to USDA 63 °C + 3 min rest, FAQ JSON-LD answers aligned with the edited visible text.

Not done / still open (no claim of clinical validation):
- 14 rows still carry unqualified treatment/detox or absorption claims (c1/c2/c3 ≥ 1) — mostly 11-04~11-14 English counterparts not edited in this pass, plus category hub posts.
- 36 rows have no FDC ID or direct DOI/PMID link; the numbers were not individually re-derived from a primary source.
- Serving-size (실제 1회 섭취량) tables exist in only 59/124 posts.
- GI/GL values are quoted in 37 posts from secondary pages; only a few are traceable to an international GI table or trial.
- No local Jekyll build is possible here (no ruby), so rendering was verified on production after deploy instead.
