#!/usr/bin/env python3
"""2026-11-27 유희원 님 지시: 전 게시물(한/영 132편) 제목 초컴팩트 일괄 수정.

국문 <= 10자(공백 포함), 영문 <= 28자(공백 포함). title frontmatter만 교체하며
permalink/slug/파일명/date/category/description/본문은 건드리지 않는다.
"""
import re
import sys
from pathlib import Path

POSTS = Path(__file__).resolve().parent.parent / "_posts"

# slug -> (국문 제목, 영문 제목)
TITLES = {
    "blueberry-nutrition-benefits": ("블루베리 냉동 팁", "Fresh vs Frozen Blueberry"),
    "onion-nutrition-benefits": ("양파 볶아 먹기", "Raw vs Cooked Onion"),
    "tomato-nutrition-benefits": ("토마토 익혀 먹기", "Cooked Tomato Lycopene"),
    "broccoli-nutrition-benefits": ("브로콜리 데치기", "Broccoli Steaming Tips"),
    "beef-sirloin-nutrition-benefits": ("소고기 등심 팁", "Beef Sirloin Nutrition"),
    "salmon-nutrition-benefits": ("연어 훈제 비교", "Raw vs Smoked Salmon"),
    "apple-nutrition-benefits": ("사과 껍질째 먹기", "Eat Apple With Skin"),
    "chicken-breast-nutrition-benefits": ("닭가슴살 삶기", "Chicken Breast Boiling"),
    "garlic-nutrition-benefits": ("마늘 10분 두기", "Crushed Garlic 10 Min"),
    "mackerel-nutrition-benefits": ("고등어 굽기 팁", "Grilled vs Braised Mackerel"),
    "banana-nutrition-benefits": ("바나나 탄수화물", "Carbs in One Banana"),
    "spinach-nutrition-benefits": ("시금치 데치는 팁", "Spinach Blanching Tips"),
    "egg-nutrition-benefits": ("삶은 계란 칼로리", "Boiled Egg Calories"),
    "shrimp-nutrition-benefits": ("새우 콜레스테롤", "Shrimp and Cholesterol"),
    "avocado-nutrition-benefits": ("아보카도 후숙 팁", "Avocado Ripening Tips"),
    "carrot-nutrition-benefits": ("당근 익혀 먹기", "Raw vs Cooked Carrot"),
    "oyster-nutrition-benefits": ("굴 아연 효능", "Oyster Zinc Benefits"),
    "tofu-nutrition-benefits": ("두부 한 모 칼로리", "Tofu Block Calories"),
    "cabbage-nutrition-benefits": ("양배추 비타민U", "Cabbage Vitamin U"),
    "orange-nutrition-benefits": ("오렌지 주스 차이", "Orange Juice vs Whole"),
    "pork-tenderloin-nutrition-benefits": ("돼지 안심 칼로리", "Pork Tenderloin Calories"),
    "squid-nutrition-benefits": ("오징어 타우린", "Squid Taurine Guide"),
    "strawberry-nutrition-benefits": ("딸기 씻는 법", "How to Wash Strawberries"),
    "sweet-potato-nutrition-benefits": ("고구마 칼로리 왜?", "Sweet Potato Calories"),
    "abalone-nutrition-benefits": ("전복 기력 회복", "Abalone Energy Boost"),
    "beef-bone-broth-nutrition-benefits": ("사골 육수 칼로리", "Bone Broth Calories"),
    "beetroot-nutrition-benefits": ("비트 혈압 효과", "Beetroot Blood Pressure"),
    "chickpea-nutrition-benefits": ("병아리콩 혈당", "Chickpea Blood Sugar"),
    "lentil-nutrition-benefits": ("렌틸콩 삶는 시간", "Lentil Cooking Time"),
    "pomegranate-nutrition-benefits": ("석류 즙 vs 생과", "Pomegranate Juice vs Raw"),
    "antioxidant-anti-aging-foods-guide": ("항산화 음식 순위", "Top 10 Antioxidant Foods"),
    "asparagus-nutrition-benefits": ("아스파라거스 효능", "Asparagus Nutrition Tips"),
    "cherry-nutrition-benefits": ("체리 수면 효과", "Cherry for Better Sleep"),
    "heart-blood-pressure-cholesterol-foods": ("혈관 건강 음식", "Foods for Blood Pressure"),
    "high-protein-foods-ranking": ("단백질 많은 음식", "Top 10 Protein Foods"),
    "kale-nutrition-benefits": ("케일 비타민K", "Kale Vitamin K Benefits"),
    "kiwi-nutrition-benefits": ("키위 변비 효과", "Kiwi for Constipation"),
    "laver-nutrition-benefits": ("김 요오드 주의", "Laver Iodine Warning"),
    "liver-immunity-fatigue-recovery-foods": ("피로 회복 음식", "Fatigue Recovery Foods"),
    "low-calorie-high-satiety-foods": ("저칼로리 포만 음식", "Low-Calorie Filling Foods"),
    "low-gi-foods-blood-sugar-guide": ("혈당 낮추는 음식", "Foods to Lower Blood Sugar"),
    "natto-nutrition-benefits": ("낫토 나토키나아제", "Natto Nattokinase"),
    "persimmon-nutrition-benefits": ("감 변비 괜찮나", "Persimmon and Constipation"),
    "tangerine-nutrition-benefits": ("귤 하루 몇 개", "How Many Tangerines?"),
    "mussel-nutrition-benefits": ("홍합 철분 효능", "Mussel Iron Benefits"),
    "napa-cabbage-nutrition-benefits": ("배추 하루 몇 장", "How Many Napa Leaves?"),
    "asian-pear-nutrition-benefits": ("배즙 하루 얼마", "Pear Juice Daily Limit"),
    "chicken-thigh-nutrition-benefits": ("닭다리살 껍질", "Chicken Thigh Skin"),
    "anchovy-nutrition-benefits": ("멸치육수 칼슘", "Anchovy Broth Calcium"),
    "radish-nutrition-benefits": ("무즙 먹어도 되나", "Can You Drink Radish Juice?"),
    "grape-nutrition-benefits": ("포도 한 송이 혈당", "Grapes and Blood Sugar"),
    "pork-belly-nutrition-benefits": ("삼겹살 구우면", "Grilled Pork Belly"),
    "lotus-root-nutrition-benefits": ("연근 데치면 손실", "Lotus Root Vitamin C"),
    "spanish-mackerel-nutrition-benefits": ("삼치 오메가3", "Spanish Mackerel Omega-3"),
    "duck-meat-nutrition-benefits": ("오리 껍질 벗기기", "Duck Meat Without Skin"),
    "yuzu-nutrition-benefits": ("유자차 당 주의", "Yuzu Tea Sugar Content"),
    "bell-pepper-nutrition-benefits": ("파프리카 색깔별", "Bell Pepper Colors"),
    "crab-nutrition-benefits": ("간장게장 나트륨", "Soy Crab Sodium Level"),
    "black-soybean-nutrition-benefits": ("서리태 단백질", "Black Soybean Protein"),
    "fig-nutrition-benefits": ("무화과 변비 효과", "Fig for Constipation"),
    "cauliflower-nutrition-benefits": ("콜리플라워 삶기", "Cauliflower Boiling Tips"),
    "kelp-nutrition-benefits": ("다시마 요오드", "Kelp Iodine Intake"),
    "beef-liver-nutrition-benefits": ("쇠간 비타민A", "Beef Liver Vitamin A"),
    "quince-nutrition-benefits": ("모과 못 먹는 이유", "Quince Raw Warning"),
    "octopus-nutrition-benefits": ("문어숙회 칼로리", "Boiled Octopus Calories"),
    "potato-nutrition-benefits": ("감자 식히는 팁", "Chilling Potato Lowers GI"),
}

KO_MAX, EN_MAX = 10, 28


def apply(write: bool):
    problems = []
    changed = 0
    seen = set()
    for path in sorted(POSTS.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        lang = re.search(r"^lang:\s*(\w+)", text, re.M).group(1)
        permalink = re.search(r"^permalink:\s*(\S+)", text, re.M).group(1)
        slug = permalink.rstrip("/").split("/")[-1]
        ko, en = TITLES[slug]
        limit = KO_MAX if lang == "ko" else EN_MAX
        new_title = ko if lang == "ko" else en
        if len(new_title) > limit:
            problems.append(f"{path.name}: {lang} title {len(new_title)}자 > {limit}: {new_title}")
        seen.add((slug, lang))
        m = re.search(r'^title:.*$', text, re.M)
        if not m:
            problems.append(f"{path.name}: title 없음")
            continue
        new_line = f'title: "{new_title}"'
        if m.group(0) != new_line:
            text = text[: m.start()] + new_line + text[m.end():]
            changed += 1
            if write:
                path.write_text(text, encoding="utf-8")
    for lang, idx in (("ko", 0), ("en", 1)):
        vals = [v[idx] for v in TITLES.values()]
        dupes = sorted({v for v in vals if vals.count(v) > 1})
        if dupes:
            problems.append(f"{lang} 중복 제목: {dupes}")
    missing = {(s, l) for s in TITLES for l in ("ko", "en")} - seen
    if missing:
        problems.append(f"매핑 누락: {sorted(missing)}")
    print(f"mapped slugs={len(TITLES)} files checked={len(seen)} changed={changed}")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print(" -", p)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(apply("--write" in sys.argv))
