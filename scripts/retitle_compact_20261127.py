#!/usr/bin/env python3
"""2026-11-27 유희원 님 지시(2차): 전 게시물(한/영 132편) 제목 '명사 나열형' 전수 교체.

1차(bb3a5fa)에서 10자/28자로 줄이며 `서리태 단백질`, `다시마 요오드`처럼 명사만
이어 붙인 제목이 남았다. 이번에는 같은 길이 제한 안에서 `~팁`·`~삶는 법`·`~먹는 법`·
`~고르는 법`·`~효과`·`~이유`·`~주의`·`~차이`처럼 서술·행동형으로 끝나게 바꾼다.

- 국문: 공백 포함 10자 이내
- 영문: 공백 포함 28자 이내, Tips / How to / Guide / Why / Benefits / Warning 류 사용
- title frontmatter만 교체. permalink/slug/파일명/date/category/description/본문 불변.

사용법:
    python3 scripts/retitle_compact_20261127.py            # 검증만 (dry-run)
    python3 scripts/retitle_compact_20261127.py --write    # 실제 반영
"""
import re
import sys
from pathlib import Path

POSTS = Path(__file__).resolve().parent.parent / "_posts"

# slug -> (국문 제목, 영문 제목)
TITLES = {
    "blueberry-nutrition-benefits": ("블루베리 냉동 팁", "Frozen Blueberry Tips"),
    "onion-nutrition-benefits": ("양파 볶아 먹기", "Raw or Cooked Onion?"),
    "tomato-nutrition-benefits": ("토마토 익혀 먹기", "Cook Tomato for Lycopene"),
    "broccoli-nutrition-benefits": ("브로콜리 데치기 팁", "Broccoli Steaming Tips"),
    "beef-sirloin-nutrition-benefits": ("소고기 등심 굽기", "How to Grill Beef Sirloin"),
    "salmon-nutrition-benefits": ("연어 훈제 비교", "Raw or Smoked Salmon?"),
    "apple-nutrition-benefits": ("사과 껍질째 먹기", "Why Eat Apple With Skin"),
    "chicken-breast-nutrition-benefits": ("닭가슴살 삶는 팁", "How to Boil Chicken Breast"),
    "garlic-nutrition-benefits": ("마늘 으깨 두는 팁", "Why Crush Garlic First"),
    "mackerel-nutrition-benefits": ("고등어 굽기 팁", "Grilled vs Braised Mackerel"),
    "banana-nutrition-benefits": ("바나나 숙성도 팁", "How Many Carbs in a Banana?"),
    "spinach-nutrition-benefits": ("시금치 데치는 팁", "Spinach Blanching Tips"),
    "egg-nutrition-benefits": ("계란 칼로리 정리", "How Many Calories in an Egg?"),
    "shrimp-nutrition-benefits": ("새우 먹어도 되나", "Shrimp Cholesterol Myth"),
    "avocado-nutrition-benefits": ("아보카도 후숙 팁", "Avocado Ripening Tips"),
    "carrot-nutrition-benefits": ("당근 익혀 먹기", "Raw or Cooked Carrot?"),
    "oyster-nutrition-benefits": ("굴 아연 섭취 팁", "Oyster Zinc: Why It Wins"),
    "tofu-nutrition-benefits": ("두부 칼로리 얼마", "How Many Calories in Tofu?"),
    "cabbage-nutrition-benefits": ("양배추 위 건강 팁", "Cabbage Vitamin U Benefits"),
    "orange-nutrition-benefits": ("오렌지 주스 차이", "Orange vs Orange Juice"),
    "pork-tenderloin-nutrition-benefits": ("돼지 안심 굽는 법", "How to Cook Pork Tenderloin"),
    "squid-nutrition-benefits": ("오징어 데치는 팁", "Why Squid Is Taurine Rich"),
    "strawberry-nutrition-benefits": ("딸기 씻는 법", "How to Wash Strawberries"),
    "sweet-potato-nutrition-benefits": ("고구마 칼로리 차이", "Sweet Potato Calorie Gap"),
    "abalone-nutrition-benefits": ("전복 손질과 삶기", "Abalone: How to Clean It"),
    "beef-bone-broth-nutrition-benefits": ("사골 맑게 우리기", "Clear Bone Broth Tips"),
    "beetroot-nutrition-benefits": ("비트 혈압 효과", "Beetroot for Blood Pressure"),
    "chickpea-nutrition-benefits": ("병아리콩 불리는 법", "Chickpea Soaking Tips"),
    "lentil-nutrition-benefits": ("렌틸콩 삶는 시간", "How Long to Cook Lentils"),
    "pomegranate-nutrition-benefits": ("석류즙과 생과 차이", "Pomegranate: Juice or Fruit?"),
    "antioxidant-anti-aging-foods-guide": ("노화 막는 음식 팁", "Top 10 Antioxidant Foods"),
    "asparagus-nutrition-benefits": ("아스파라거스 효능", "Asparagus Nutrition Tips"),
    "cherry-nutrition-benefits": ("체리 수면 효과", "Cherry for Better Sleep"),
    "heart-blood-pressure-cholesterol-foods": ("혈압 내리는 음식", "10 Foods for Blood Pressure"),
    "high-protein-foods-ranking": ("단백질 많은 음식", "Top 10 Protein Foods"),
    "kale-nutrition-benefits": ("케일 데치는 팁", "Kale: Steam or Juice?"),
    "kiwi-nutrition-benefits": ("키위 변비 효과", "Kiwi for Constipation"),
    "laver-nutrition-benefits": ("김 요오드 주의", "Laver Iodine Warning"),
    "liver-immunity-fatigue-recovery-foods": ("피로 풀리는 음식", "10 Foods to Beat Fatigue"),
    "low-calorie-high-satiety-foods": ("포만감 높은 음식", "10 Filling Low-Cal Foods"),
    "low-gi-foods-blood-sugar-guide": ("혈당 낮추는 음식", "Foods That Lower Blood Sugar"),
    "natto-nutrition-benefits": ("낫토 제대로 먹기", "How to Eat Natto Right"),
    "persimmon-nutrition-benefits": ("감 변비 논란 정리", "Persimmon Constipation Myth"),
    "tangerine-nutrition-benefits": ("귤 하루 몇 개", "How Many Tangerines?"),
    "mussel-nutrition-benefits": ("홍합 철분 효능", "How to Clean Mussels"),
    "napa-cabbage-nutrition-benefits": ("배추 하루 몇 장", "How Many Napa Leaves?"),
    "asian-pear-nutrition-benefits": ("배즙 하루 얼마", "How Much Pear Juice?"),
    "chicken-thigh-nutrition-benefits": ("닭다리 껍질 팁", "Why Remove Thigh Skin"),
    "anchovy-nutrition-benefits": ("멸치 육수 내기", "Anchovy Broth: Any Calcium?"),
    "radish-nutrition-benefits": ("무즙 기침에 좋나", "Can You Drink Radish Juice?"),
    "grape-nutrition-benefits": ("포도 적당량 팁", "Grapes: Blood Sugar Guide"),
    "pork-belly-nutrition-benefits": ("삼겹살 굽는 법", "Pork Belly Grilling Tips"),
    "lotus-root-nutrition-benefits": ("연근 데치는 팁", "Lotus Root Boiling Loss"),
    "spanish-mackerel-nutrition-benefits": ("삼치 굽기 팁", "Grilling Spanish Mackerel"),
    "duck-meat-nutrition-benefits": ("오리 껍질 벗기기", "Duck Meat: Skin or Not?"),
    "yuzu-nutrition-benefits": ("유자차 당 줄이기", "Yuja Tea Sugar: How Much?"),
    "bell-pepper-nutrition-benefits": ("파프리카 고르기", "Bell Pepper Color Guide"),
    "crab-nutrition-benefits": ("게장 덜 짜게 먹기", "Soy Crab Too Salty?"),
    "black-soybean-nutrition-benefits": ("서리태 불리기 팁", "How to Soak Black Soybeans"),
    "fig-nutrition-benefits": ("무화과 변비 효과", "Fig for Constipation"),
    "cauliflower-nutrition-benefits": ("콜리플라워 삶는 팁", "Cauliflower Boiling Tips"),
    "kelp-nutrition-benefits": ("다시마 육수 팁", "Kelp Broth Iodine Tips"),
    "beef-liver-nutrition-benefits": ("쇠간 과다 주의", "Beef Liver: Vitamin A Risk"),
    "quince-nutrition-benefits": ("모과 못 먹는 이유", "Why Quince Is Cooked"),
    "octopus-nutrition-benefits": ("문어 삶는 법", "Octopus Boiling Tips"),
    "potato-nutrition-benefits": ("감자 식히는 팁", "Chilling Potato Lowers GI"),
}

KO_MAX, EN_MAX = 10, 28

# 국문 제목이 끝나야 하는 서술·행동형 어미 (명사 나열 금지)
KO_ENDINGS = (
    "팁", "법", "효과", "효능", "이유", "주의", "차이", "비교", "시간", "정리",
    "우리기", "내기", "먹기", "삶기", "굽기", "데치기", "씻기", "벗기기", "고르기",
    "불리기", "줄이기", "두기", "얼마", "개", "장", "되나", "좋나", "있나", "맞나",
)
# `~는/은/ㄴ 음식`처럼 관형형 수식을 받은 '음식'은 허용 (예: 혈당 낮추는 음식)
KO_FOOD_QUALIFIERS = ("낮추는 음식", "내리는 음식", "풀리는 음식", "높은 음식",
                      "막는 음식", "많은 음식")
# 영문 제목에 반드시 하나 들어가야 하는 서술 신호
EN_MARKERS = ("Tips", "How", "Guide", "Why", "Benefits", "Warning", "Best", "Top",
              "vs", "or", "?", "Can", "Never", "Myth", "Loss", "Gap",
              "Grilling", "Chilling", "Lowers", "That", "Filling", "Beat", "Risk")


def is_noun_dump_ko(title: str) -> bool:
    return not (title.endswith(KO_ENDINGS) or title.endswith(KO_FOOD_QUALIFIERS))


def is_noun_dump_en(title: str) -> bool:
    return not any(m in title for m in EN_MARKERS)


def apply(write: bool):
    problems = []
    changed = 0
    seen = set()
    noun_dumps = []
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
        if lang == "ko" and is_noun_dump_ko(new_title):
            noun_dumps.append(f"KO {path.name}: {new_title}")
        if lang == "en" and is_noun_dump_en(new_title):
            noun_dumps.append(f"EN {path.name}: {new_title}")
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
    if noun_dumps:
        problems.extend(f"명사 나열형: {d}" for d in noun_dumps)
    print(f"mapped slugs={len(TITLES)} files checked={len(seen)} changed={changed} "
          f"noun_dump={len(noun_dumps)}")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print(" -", p)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(apply("--write" in sys.argv))
