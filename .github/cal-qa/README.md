# Calculator release gate (2026-11-26)

Production main has intentionally not been changed. This branch adds the 2026 withholding lookup, exact/manual bond cost options, property tax overlap credit, policy effective-date handling, insurance precision and improved calendar fields.

## Verified in isolated JS runtime
- 646 contiguous withholding ranges; 7,106 amounts. 14,212 start/end boundary checks. Three full rows compared with the official law PDF (33 cells).
- Nine separate withholding examples, including children, 80/120%, and high-income boundaries.
- 18 calculation callbacks using a lightweight DOM/input simulation and a mocked FX response (not a browser).
- Property-credit and insurance edge tests, including 1,000 salary points for employment insurance.
- JavaScript syntax checked.

## Required local release gate (not executed here)
1. Obtain the official 2026-03-01 NTS XLSX. Run verify-tax-table.py with it; all cells and high reference row must match.
2. Run smoke.mjs with Playwright Chromium. Actual lunar CDN, actual Frankfurter, 320–1920px overflow, calculator actions, and error-free runtime must pass. Inspect mobile appearance, touch targets, and Safari/Android as available.
3. Validate all real-estate tax rules against the relevant transaction date and official example cases. Special exclusions remain user-confirmed; no automatic determination of legal eligibility.
4. National housing bond: a verified public rate API was not located. The official bank customer-cost / rate input is functional; daily automatic retrieval is not implemented. Do not claim it is automatic. For exact cost use official customer amount instead of rounded rate.
5. Merge to main only after acceptance; Cloudflare Pages production build status and /cal/ HTTP response must be checked. Preserve noindex and X-Robots-Tag. Do not add GitHub Actions, D1, or paid server.

Sources:
- https://law.go.kr/flDownload.do?bylClsCd=110201&flSeq=163623339&gubun=
- https://teht.hometax.go.kr/doc/sf/a/a/근로소득%20간이세액표_2026.03.01.xlsx
- https://www.law.go.kr/LSW/lsInfoP.do?efYd=20261001&lsiSeq=290557
- https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=290815&viewCls=lsRvsDocInfoR
- https://okbfex.kbstar.com/quics?page=C028044
