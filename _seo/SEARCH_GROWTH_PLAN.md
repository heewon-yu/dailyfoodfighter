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

Commits: `5f9a15b` (content fixes), `99df698` (audit table + scanner tools), `58073f3` (this doc), `590c04f` `f85d55a` `8c6a903` `069665e` `d9aaa3d` `5253685` (FAQ answer alignment, see below). No `[skip ci]` in any message.

**Deliverable: `_seo/content_audit_124.csv`** — 124 rows (62 pairs), 34 columns: file, URL, language, pair slug, category, title/H1, description length, answer-first paragraph text, serving-size table, per-100 g table, front-matter basis (`servingSize`), raw/cooked/dried state, FDC IDs, direct DOI/PubMed/FDC links, per-class high-risk counts (c1 treatment/cure/detox, c2 absorption multiples, c3 blanket safe intake, c4 raw–cooked mixing, c5 numeric GI/GL, c6 animal/in-vitro, c7 bare percentages), FAQ body vs JSON-LD divergence, review status, action taken, remaining check. Rebuild with `python3 _seo/p1_build_audit.py . _seo/content_audit_124.csv`; inspect every matched sentence with `python3 _seo/p1_dump_claims.py <files...>`.

Inventory (as of this pass): answer-first box 124/124, per-100 g table 124/124, serving-size table 59/124, source ID or direct reference link 30/124 (was 20/124), FAQ body–JSON-LD divergence 0/0 after the alignment below (was 15 numeric / 34 paraphrase). Unqualified claim hits: c1 25, c2 26, c3 29, c5 (numeric GI/GL) 37, c6 26, c7 18. Review status: 수정완료 28 rows (14 pairs), 표현 완화 필요 14, 경미 검토 필요 40, 출처 ID 보강 필요 36, 구조·표현 양호 6.

**FAQPage answers now equal the rendered answer text (124 posts).** `_seo/p1_align_faq_jsonld.py` matches each Question to its visible Q/A block (both `### Q`/`**A:**` and `**Q1. …**` styles), replaces the structured answer with the visible text, and normalises quotation glyphs to the curly form Jekyll renders. Production check after deploy: 124/124 pages, every FAQPage question and answer found verbatim in the rendered text, 0 fetch errors.

Fixed in `5f9a15b` (28 source files + calculator include):
- **Chicken breast** — the 110 kcal / 23.1 g / 1.24 g basis did not match any single source: potassium 334 mg came from USDA FDC 171077 (raw) while B6 0.60, B12 0.34, P 228 and Se 27.6 came from FDC 171477 (cooked, roasted). Replaced the whole table with FDC 171077 (120 kcal, 22.5 g protein, 2.62 g fat, K 334, B6 0.81, B12 0.21, P 213, Se 22.8, water 73.9), recomputed every %DV, and added the Korean national entry (닭고기, 가슴, 생것, I008000D020a: 106 kcal, 22.97 g, 0.97 g) as a separately labelled sample. Calculator note now states both pages use FDC 171077.
- **Cabbage / broccoli / garlic / carrot** — treatment, cure, cancer-prevention and “liver detox” assertions narrowed to cell/animal evidence or removed; unsupported multiples (3×, 5×, 2×, 10×, 6,000×) deleted; invented analysed values (vitamin U 18.2 mg, glucosinolate 42 mg, saponin 65 mg) removed from tables; blanket “X g is safe” answers replaced with individual guidance; FDC IDs added where the numbers matched (carrot 170393, cabbage 169975, broccoli 170379).
- **Salmon / egg / tofu / spinach / avocado / oyster / shrimp / pork tenderloin / orange / banana** — quoted percentages and multiples tied to their study conditions (e.g. triglycerides 20–30% only at 2–4 g EPA+DHA/day), pork cooking answer corrected to USDA 63 °C + 3 min rest, FAQ JSON-LD answers aligned with the edited visible text.

Not done / still open (no claim of clinical validation):
- 14 rows still carry their highest-risk wording (squid, beetroot, lentil, cherry, kiwi, laver, natto, anchovy, lotus root, black soybean, cauliflower, kelp, beef sirloin, orange) — listed in the CSV `review_status = 표현 완화 필요(미수정)`; 68 rows in total have at least one unqualified claim-class hit of any severity.
- 36 rows have no FDC ID or direct DOI/PMID link; the numbers were not individually re-derived from a primary source.
- Serving-size (실제 1회 섭취량) tables exist in only 59/124 posts.
- GI/GL values are quoted in 37 posts from secondary pages; only a few are traceable to an international GI table or trial.
- No local Jekyll build is possible here (no ruby), so rendering was verified on production after deploy instead.

## P1-2 complete — 2026-11-25 (last 14 high-risk Korean posts + 4–20 position query work)

**Deliverables:** `_seo/keyword_competition_audit.md` (competitor anatomy for 16 queries, 4–20 position candidate table, before/after of the three upgraded pairs), `_seo/keyword_mapping_62.csv` (62 pairs × 12 columns incl. GSC 4–20 queries and priority rank), `_seo/content_audit_124.csv` rebuilt (`수정완료` 42, `표현 완화 필요(미수정)` 0).

**High-risk wording, last 14 Korean posts** (beef sirloin, orange, squid, beetroot, lentil, cherry, kiwi, laver, natto, anchovy, lotus root, black soybean, cauliflower, kelp). Removed or limited: treatment/cure/detox assertions (squid cholesterol FAQ no longer tells hyperlipidaemia readers they can eat it freely; beef "root cure for anaemia" → diagnosis first), unsupported absorption multiples (10×, 3×, 4–6×, 2–3×), blanket safe intakes (laver "2–5 sheets is safe", natto "3–4 times a week is enough", black soybean "30 g is safe"), animal/in-vitro extrapolations (nattokinase fibrinolysis, betanidin NF-κB, cherry COX-2). Three factual corrections: laver 5-sheet protein is 3.9 g vs a 6.3 g egg (was "same as one egg"); cherry melatonin is 1/4,000–1/40,000 of a supplement pill (was 1/50,000); lotus root's 39% vitamin C drop is the food-composition table's boiled sample, not a 1-minute blanch. FAQ JSON-LD realigned by `p1_align_faq_jsonld.py` (25 posts / 36 answers, including pre-existing drift in unrelated posts — one persimmon answer had swallowed later sections). `faq_check.py` → 0 issues.

**4–20 position queries.** 37 of 375 queries sit at positions 1–20 (≈12% of impressions); most high-impression queries are still at 50–90. The pattern in the winning pages is "question + number in the title, per-piece/per-100 g answer in the first three lines, size or portion table next, raw-vs-cooked note". Three pairs were upgraded on that pattern without changing URLs or facts: egg EN/KR (6.3 g protein per large egg, white 3.6 g / yolk 2.7 g, boiled 77 kcal vs raw 72), banana EN/KR (27 g carbs / 14 g sugars / 3.1 g fiber per 118 g banana, 23–31 g by size, net-carb note), spinach EN/KR (palak keerai alias, 23 kcal / 2.71 mg iron / 194 mcg folate per 100 g, oxalate and iron-absorption caveat first). Each also replaced a 4–5 paragraph hype intro with a factual answer-first paragraph.

**Competitor observations worth keeping** (2026-11-25 search snapshots, not ranking guarantees): English top pages carry a named medical/nutrition reviewer and a size table (Healthline, Harvard, Cleveland Clinic, egginfo); Korean top pages for tofu/chicken/pork/high-protein are food-DB calculators built on 농진청 국가표준식품성분 DB (`하루단백`, `food.infopick`, `proteinlab`), so per-block/per-pack conversions decide those SERPs. `mackerel fishmeal` (13.7) is an aquafeed query, not a nutrition one — do not chase it; the same page should target `mackerel omega 3` and `고등어 껍질 효능`. Our `/posts/laver-nutrition-benefits/` currently ranks first for `김 한 장 칼로리`, which confirms the "one sheet + iodine ceiling + seasoned-vs-dried" structure.

**Still open**
- Data-table conflicts to disclose, not overwrite: banana (USDA 89 kcal vs Korean table 77 kcal per 100 g), sweet potato (USDA 86 vs Korean 110–128), chicken breast (USDA FDC 171077 120 kcal/22.5 g vs Korean 106 kcal/22.97 g). Add a side-by-side source note per page.
- Calculator expansion (5 foods now → target ~56) limited to foods whose FDC ID or Korean food code is confirmed; state raw/cooked basis next to each row.
- Content gaps for observed queries: cauliflower-rice H3 (200 g conversion, dry-frying method), mackerel-skin H3 (species-specific omega-3), avocado PPO activity (no number until a primary source is checked).
- `source_id_present` still 30/124; serving tables 60/124.

## P1-3 complete — 2026-11-26 (source conflicts, calculator expansion, source IDs, serving tables)

**Search exclusion (user instruction, 2026-11-26).** `_headers` now sends `X-Robots-Tag: noindex, nofollow` for `/games`, `/games/*`, `/map`, `/map/*`, `/benefits`, `/benefits/*` until the AdSense re-review passes. `robots.txt` was deliberately left untouched (a Disallow would stop Google from ever reading the noindex), and no page code, API or sitemap entry was changed — the sitemap never listed these paths. Delete the six blocks at the end of `_headers` to restore indexing.

**Data-table conflicts, now disclosed side by side (3 foods × KO/EN).** Each page carries a two-row table with both sources and an explanation of the sample difference:
- Banana — USDA FDC 173944 (89 kcal, 22.84 g carb, water 74.91 g) vs Korean national table H0370000000a, RDA 2020 (77 kcal, 20.0 g carb, water 78 g); 1 medium 118 g = 105 kcal vs about 91 kcal.
- Sweet potato — USDA FDC 168482 (86 kcal, water 77.28 g) vs Korean code B0060000000a, RDA 2013 (**147 kcal**, water 62.2 g, carb 35.52 g). The earlier working note of "110–128 kcal" could not be reproduced in the current national DB; 147 kcal is what the RDA entry lists and is what the page now states. KO/EN titles and descriptions were changed so the headline no longer asserts 86 kcal on a page whose body says 147.
- Chicken breast — USDA FDC 171077 (120 kcal, 22.5 g protein, 2.62 g fat) vs Korean code I008000D020a, RDA 2015 (106 kcal, 22.97 g, 0.97 g). The 1.65 g fat difference explains almost all of the 14 kcal gap (1 g fat ≈ 9 kcal); the cooked entry FDC 171477 (165 kcal/31.0 g) is shown separately so raw and cooked are not mixed.

**Observed-query H3s added.** Cauliflower KO/EN: cauliflower rice at 200 g with a dry-pan method, yield 130–150 g, 54 kcal unchanged by dry-frying, 1 tsp vs 1 tbsp oil (99 / 174 kcal) and white rice 200 g (about 260 kcal, 56–57 g carb). Mackerel KO/EN: skin and dark muscle, species spread (Atlantic 2,299 mg EPA+DHA vs Spanish 1,341 vs king 313 per 100 g raw) and measured cooking loss (Atlantic cooked 1,203 mg, about 48% less per 100 g; the higher 262 kcal per 100 g is water loss, not added oil).

**Nutrition calculator: 5 → 55 foods / 58 rows (`/nutrition-calculator/`, `/en/nutrition-calculator/`).** Every row states its basis (raw, cooked, dried, canned) and links to a USDA FDC entry or, for three rows, the RDA food code. All kcal/protein values were re-derived from the official SR Legacy CSV (April 2018 download) rather than copied from search results. Banana, sweet potato and chicken breast appear twice (USDA row + Korean row) so the calculator and the three guides agree. Ten rows carry a ※ marking a guide that presents a different basis (파프리카, 귤, 포도, 감, 모과, 삼겹살, 검은콩, 멸치, 꽃게, 굴). Dried laver, yuzu and bone broth were left out: no FDC/K-FIND entry could be verified for the form the guides describe. The formula (g/100), 0–5000 g validation, bilingual UI and two-portion comparison are unchanged.

**Source IDs: 30/124 → 71/124.** 39 posts received a specific FDC line, added only after the post's own table and front matter matched that entry's kcal and protein (tolerance 1 kcal / 0.06 g). 10 rows could not be matched and were left uncited rather than guessed: oyster (68/7.13 matches no raw entry), pork tenderloin (120/21.8 — RDA lists 123/22.21, USDA 120/20.65), bell pepper KR (30/1.5), crab KR (77/16.2), black soybean (413/38.7 and 381/36.0), fig KR (47/0.8). A further set of "N" rows already carry a plain USDA link without an ID, which the audit counts as no ID; they are listed in the CSV.

**Serving-size tables: 61/124 → 92/124.** 19 posts (spinach, carrot, tofu, chicken breast, oyster, garlic, onion ×2 languages plus EN banana, egg, blueberry, apple, squid) got a 1-serving conversion table using USDA portion weights, scaled from each article's own per-100 g values.

**Transparency.** KO/EN About pages now state how sources are cited (FDC ID and RDA code next to every table), link the calculator, and keep a short corrections log. The 2026-11-26 beef liver post (published the same morning) had its heme-iron absorption wording qualified and its FAQ JSON-LD realigned; `faq_check.py` returns 0 issues for all 124 posts.

**Still open**
- 57 rows lack an ID (the 10 unmatched above, the 6 hub guides, and link-only pages); 36 rows have no serving table.
- GI/GL values remain quoted from secondary pages; no international GI table has been checked.
- The 2026-11-26 beef liver post (published the same morning) still carries one audit hit for quoting the 15–35% / 2–20% heme vs non-heme absorption range. The wording was qualified as a literature range with iron status and meal composition stated; it is listed here rather than silently cleared.
- 10 calculator rows deliberately disagree with their guide's basis (marked ※).
- AdSense re-review pending; the noindex exclusion above stays until it passes.
