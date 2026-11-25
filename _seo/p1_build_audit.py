#!/usr/bin/env python3
"""Build `_seo/content_audit_124.csv`: the P1-1 management table for all 124 posts.

Columns record what is structurally present in each post (answer-first paragraph,
serving table, per-100 g table, source IDs, raw/cooked state), the seven
high-risk claim classes with a qualified/unqualified split, FAQ body vs JSON-LD
consistency, and the review status for this pass.

A hit is counted as *unqualified* unless a hedging phrase appears within the
match window (e.g. "확립되지 않", "근거는 없", "not established"). Qualified hits
mean the post already states the limitation and are kept only as context.
"""
import csv, json, re, sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
out_csv = Path(sys.argv[2] if len(sys.argv) > 2 else "_seo/content_audit_124.csv")

HEDGE = re.compile(
    r"확립되지|확립된 것은|아직 (없|확인|나오지)|근거(가|는) (없|부족|확인되지|충분하지)|"
    r"단정할 수 없|단정하지 않|증명하지 못|인과관계|관찰연구|일반화할 수 없|"
    r"not established|has not been shown|no human|evidence is limited|association, not|"
    r"관련 근거|보고됐지만|보고되었으나|제한적|불확실|알 수 없|정해진 기준은 없|공식 (권장량|상한)은 없",
    re.I,
)

RISK = {
    "c1_treatment_cure_prevention": re.compile(
        r"치료(?!제)|완치|항암|암(을|세포를)? ?예방|암 예방|질병을? ?예방(한다|합니다)|예방한다|"
        r"해독(한다|작용|효과|대사|경로|시스템)|디톡스|노화(를)? ?(방지|막|역전)|안티에이징|"
        r"anti-?aging|cures?\b|reverses? aging|면역력을? ?(높여|강화) ?(준|줍)|"
        r"간 ?해독|치유 식|항암 시너지", re.I),
    "c2_absorption_multiple": re.compile(
        r"(흡수율|흡수량|생체이용률|이용률|항산화력)[^.\n]{0,40}?\d+(\.\d+)?\s*(배|%)|"
        r"\d+(\.\d+)?\s*배(나|까지| 이상)?\s*(높|늘|증가|뛰|빨리|잘 흡수|상승|급증|차이|향상|개선|많)|"
        r"absorption (rate )?(by )?\d+|bioavailability[^.\n]{0,30}\d+", re.I),
    "c3_blanket_safe_intake": re.compile(
        r"하루\s*[\d~～\-–]+\s*(g|mg|개|회|잔|컵|장)[^.\n]{0,30}(안전|문제없|무리 ?없)|"
        r"(섭취|먹어도|먹는 것은|복용)[^.\n]{0,25}안전(합니다|하다)|"
        r"\d+\s*(g|개|장|회)\s*(까지|이내)[^.\n]{0,25}안전|is safe|are safe|safe to (eat|consume|take)",
        re.I),
    "c4_raw_cooked_mix": None,  # computed from front matter vs body
    "c5_gi_gl": re.compile(
        r"(?<![A-Za-z])(GI|GL)(?![A-Za-z])[^.\n]{0,8}?[:(]?\s*(약\s*)?\d{1,3}|"
        r"혈당지수[^.\n]{0,8}?\d{1,3}|glycemic (index|load)[^.\n]{0,10}?\d{1,3}", re.I),
    "c6_animal_invitro_extrapolation": re.compile(
        r"쥐|생쥐|마우스|랫트|동물 ?실험|동물 ?모델|시험관|세포 ?실험|in vitro|in mice|mouse study|"
        r"rodent|동물 연구", re.I),
    "c7_bare_percent_effect": re.compile(
        r"\d{2,3}\s*%\s*(까지|나)?\s*(높|낮|줄|감소|증가|개선|향상|억제|차단|단축|상승)", re.I),
}

FDC_RE = re.compile(r"FDC\s*#?\s*(\d{4,7})|food-details/(\d{4,7})")
LINK_RE = re.compile(r"https?://(?:doi\.org|pubmed\.ncbi\.nlm\.nih\.gov|pmc\.ncbi\.nlm\.nih\.gov|fdc\.nal\.usda\.gov)/[^\s)\"<]+")

FIXED = {
    "chicken-breast-nutrition-benefits": "USDA FDC 171077 값으로 표·front matter·FAQ 전면 재계산, 생것/익힌 것 혼용 제거, 안전량·흡수율 단정 완화, 계산기 안내 문구 동기화",
    "carrot-nutrition-benefits": "항암 단정·껍질 항암 활성 삭제, 8~10%/60~70% 흡수율 수치 삭제, GI 35 단정 → 연구별 범위로, FDC 170393 명시",
    "cabbage-nutrition-benefits": "궤양 치유·H. pylori 억제·골다공증 예방 단정 완화, '치료/해독' 표현 정리, 미확인 비타민U·글루코시놀레이트 수치 행 삭제, 3배 흡수·1.5~2배 심지 수치 삭제, FDC 169975 명시",
    "broccoli-nutrition-benefits": "NCI·항암 시너지·'자연 최고 항산화 백신' 등 단정 완화, 5배·2배 흡수 배수 삭제, 갑상선 '1kg까지 안전·80% 불활성화' 완화, FDC 170379 명시",
    "garlic-nutrition-benefits": "혈압 8~10mmHg·감염 60% 단축·콜레스테롤 10~15%·혈전 용해·중금속 배출 단정 완화, '천연 치료 식품' 표현 정리, 흑마늘 10배 수치 일반화 철회",
    "salmon-nutrition-benefits": "중성지방 20~30%를 EPA·DHA 2~4g 시험 근거로 한정, 아스타잔틴 뇌혈관 장벽·기억력 단정 완화, 3배 흡수·훈제 나트륨 5~10배 수치 삭제",
    "egg-nutrition-benefits": "루테인 3~4배·라이코펜 400% 배수 완화, 91%/51% 소화율을 소규모 동위원소 연구로 명시",
    "tofu-nutrition-benefits": "두부 95%/콩 65% 소화율 비교 삭제, 사포닌 항암·면역 단정 완화, 부침/얼린 두부 1.5~2배·5~6배 수치 삭제, 미확인 사포닌 65mg 행 삭제",
    "spinach-nutrition-benefits": "4~5배·3배·2~3배 흡수 배수 완화, 수산 80% 제거·'결석 걱정 없이 안전' 단정 완화",
    "avocado-nutrition-benefits": "4~15배·10배 흡수 배수 연구 범위로 한정, GI 15 이하 단정 → 연구별 범위, '하루 1/2개 안전' → 열량 예산 설명으로 교체",
    "oyster-nutrition-benefits": "타우린 간 해독·숙취 해소 단정 완화, 구연산 2~3배 흡수·무즙 중금속 '완벽 흡착' 삭제, 85℃ '완벽 차단' → 위험 감소로",
    "shrimp-nutrition-benefits": "아스타잔틴 비타민C 6,000배·E 500배 비교를 시험관 값으로 명시, 타우린 간 해독·심근 수축력 단정 완화, 레몬 항산화 2배 삭제",
    "banana-nutrition-benefits": "공복 섭취 '완벽히 유지·심장 위험 0' 단정 완화, 신장 기능 저하 시 칼륨 주의로 대체(한/영)",
    "pork-tenderloin-nutrition-benefits": "비타민B1 10배·5배, 알리티아민 흡수 10배 수치 완화, 미디엄 익힘 안전 답변을 USDA 63℃·3분 기준으로 교체",
}

rows = []
for f in sorted((root / "_posts").glob("*.md")):
    raw = f.read_text(encoding="utf-8")
    fm = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", raw, re.S)
    front, body = fm.groups()
    claim_src = re.sub(r"<script.*?</script>", " ", body, flags=re.S)
    claim_src = re.sub(r'<div class="related-hub-box">.*?</div>', " ", claim_src, flags=re.S)
    claim_src = re.sub(r"\[([^\]]*)\]\([^)]*\)", " ", claim_src)
    claim_src = re.sub(r"\{\{[^}]*\}\}", " ", claim_src)
    flat = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", claim_src)).strip()

    def field(k):
        m = re.search(r"^" + re.escape(k) + r":\s*(.*?)\s*$", front, re.M)
        return m.group(1).strip().strip('"\'') if m else ""

    url = field("permalink")
    slug = url.rstrip("/").split("/")[-1]
    lang = field("lang")
    title = field("title")
    desc = field("description")
    serving = field("servingSize")

    af = re.search(r'<div class="answer-first">(.*?)</div>', body, re.S)
    af_text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", af.group(1))).strip() if af else ""

    counts, notes = {}, {}
    for k, rx in RISK.items():
        if rx is None:
            continue
        unq = []
        for m in rx.finditer(flat):
            s = max(0, m.start() - 90); e = min(len(flat), m.end() + 90)
            win = flat[s:e]
            if HEDGE.search(win):
                continue
            unq.append(re.sub(r"\s+", " ", flat[max(0, m.start() - 30):m.end() + 30]).strip())
        counts[k] = len(unq)
        if unq:
            notes[k] = unq[0][:120]

    fdc = sorted({g for t in FDC_RE.findall(body) for g in t if g})
    links = LINK_RE.findall(body)
    raw_state = bool(re.search(r"생것|raw", flat, re.I))
    cooked = bool(re.search(r"삶은|삶아|익힌|구운|볶은|데친|cooked|boiled|roasted|grilled", flat, re.I))
    dried = bool(re.search(r"건조|말린|dried", flat, re.I))
    cook_nums = len(re.findall(r"(삶은|삶아|익힌|구운|볶은|데친|조리한|cooked|boiled|roasted|grilled)[^.\n]{0,40}\d+\s*(kcal|g\b)", flat, re.I))
    mixed = bool(re.search(r"생것|raw", serving, re.I)) and cook_nums >= 3

    vis, ld = [], []
    for b in re.split(r"\n(?=### )", body):
        m = re.match(r"###\s*(?:Q\d*\.?\s*)?(.+?)\s*\n+(.*)", b, re.S)
        if not m:
            continue
        am = re.search(r"\*\*A[:：]\*\*\s*(.+?)(?:\n\n|\n#|\n<div|\n<script|$)", m.group(2), re.S)
        if am:
            vis.append((m.group(1).strip(), re.sub(r"\s+", " ", am.group(1)).strip()))
    for blk in re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>\s*(.*?)\s*</script>', body, re.S):
        try:
            d = json.loads(blk)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("@type") == "FAQPage":
            ld += [(e.get("name", ""), e.get("acceptedAnswer", {}).get("text", "")) for e in d.get("mainEntity", [])]
    para_diff = num_conflict = 0
    for lq, la in ld:
        if not vis:
            continue
        best = max(vis, key=lambda p: SequenceMatcher(None, lq, p[0]).ratio())
        if SequenceMatcher(None, lq, best[0]).ratio() <= 0.55:
            continue
        nr = SequenceMatcher(None, la[:160], best[1][:160]).ratio()
        na, nb = set(re.findall(r"\d+(?:\.\d+)?", la)), set(re.findall(r"\d+(?:\.\d+)?", best[1]))
        if nr < 0.55:
            para_diff += 1
        if na and nb and len(na ^ nb) >= 2 and nr < 0.9:
            num_conflict += 1

    high = counts["c1_treatment_cure_prevention"] + counts["c2_absorption_multiple"] + counts["c3_blanket_safe_intake"] + counts["c7_bare_percent_effect"]
    if slug in FIXED:
        status = "수정완료"
        action = FIXED[slug]
    elif high >= 3:
        status = "표현 완화 필요(미수정)"
        action = ""
    elif high >= 1:
        status = "경미 검토 필요"
        action = ""
    elif not fdc and not links:
        status = "출처 ID 보강 필요"
        action = ""
    else:
        status = "구조·표현 양호(원문 대조 남음)"
        action = ""

    rows.append({
        "file": f.name,
        "url": url,
        "lang": lang,
        "pair_slug": slug,
        "category": field("category"),
        "title": title,
        "title_len": len(title),
        "h1": title + " (layout post.html이 렌더)",
        "description_len": len(desc),
        "answer_first": "Y" if af_text else "N",
        "answer_first_text": af_text[:140],
        "serving_table": "Y" if re.search(r"1\s*(회|인분|개|장|컵|봉|캔|마리|쪽|공기)\s*(섭취|분량|기준)?|per serving", flat, re.I) else "N",
        "per100g_table": "Y" if re.search(r"100\s*g\s*(당|기준)|per 100\s*g", flat, re.I) else "N",
        "front_serving_basis": serving,
        "state_flags": "/".join([n for n, c in (("raw", raw_state), ("cooked", cooked), ("dried", dried)) if c]),
        "fdc_ids": ",".join(fdc),
        "direct_ref_links": len(links),
        "source_id_present": "Y" if (fdc or links) else "N",
        "raw_cooked_mix": "Y" if mixed else "N",
        "cooked_state_numeric_claims": cook_nums,
        "c1": counts["c1_treatment_cure_prevention"],
        "c2": counts["c2_absorption_multiple"],
        "c3": counts["c3_blanket_safe_intake"],
        "c4": "Y" if mixed else "",
        "c5": counts["c5_gi_gl"],
        "c6": counts["c6_animal_invitro_extrapolation"],
        "c7": counts["c7_bare_percent_effect"],
        "high_risk_total": high,
        "faq_paraphrase_diff": para_diff,
        "faq_numeric_conflict": num_conflict,
        "top_claim_sample": " | ".join(f"{k.split('_')[0]}:{v}" for k, v in list(notes.items())[:3]),
        "review_status": status,
        "action_taken_2026_11_25": action,
        "remaining_check": "원문(USDA FDC/DOI) 대조 및 실사 확인" if status != "수정완료" else "수정 후 잔여 문장 재검토",
    })

with open(out_csv, "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

print(json.dumps({
    "rows": len(rows),
    "status": dict(Counter(r["review_status"] for r in rows)),
    "answer_first": sum(r["answer_first"] == "Y" for r in rows),
    "serving_table": sum(r["serving_table"] == "Y" for r in rows),
    "per100g": sum(r["per100g_table"] == "Y" for r in rows),
    "source_id": sum(r["source_id_present"] == "Y" for r in rows),
    "raw_cooked_mix": sum(r["raw_cooked_mix"] == "Y" for r in rows),
    "faq_paraphrase_diff": sum(r["faq_paraphrase_diff"] > 0 for r in rows),
    "faq_numeric_conflict": sum(r["faq_numeric_conflict"] > 0 for r in rows),
    "c1": sum(r["c1"] > 0 for r in rows), "c2": sum(r["c2"] > 0 for r in rows),
    "c3": sum(r["c3"] > 0 for r in rows), "c5": sum(r["c5"] > 0 for r in rows),
    "c6": sum(r["c6"] > 0 for r in rows), "c7": sum(r["c7"] > 0 for r in rows),
    "out": str(out_csv),
}, ensure_ascii=False, indent=2))
