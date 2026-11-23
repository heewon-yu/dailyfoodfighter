#!/usr/bin/env python3
"""Rewrite frontmatter title/description of top-impression English posts (dry run by default)."""
import re
import sys
from pathlib import Path

POSTS = Path("_posts")

DATA = [
    ("2026-11-08-en-banana-nutrition-benefits.md",
     "Banana Nutrition per 100 g: 89 Calories, 358 mg Potassium",
     "A 100 g banana has 89 calories, 22.8 g carbs, 2.6 g fiber and 358 mg potassium (a medium fruit: 105 calories, 422 mg). Carbs, sugar and ripeness answered."),
    ("2026-11-08-en-spinach-nutrition-benefits.md",
     "Spinach Nutrition per 100 g: 23 Calories, 483 mcg Vitamin K",
     "Raw spinach has 23 calories, 2.2 g fiber and 483 mcg vitamin K per 100 g. Does sauteing cut oxalates? Boiling vs sauteing compared, plus iron and pH notes."),
    ("2026-11-10-en-carrot-nutrition-benefits.md",
     "Carrot Nutrition per 100 g: 41 Calories, 835 mcg Vitamin A",
     "Carrots have 41 calories, 835 mcg vitamin A (8,285 mcg beta-carotene) and 2.8 g fiber per 100 g. Which vitamins they hold, and why fat raises absorption."),
    ("2026-11-11-en-tofu-nutrition-benefits.md",
     "Tofu Protein per 100 g: 8.1 g, 76 Calories, 350 mg Calcium",
     "Firm tofu has 8.08 g protein, 76 calories, 350 mg calcium and 5.4 mg iron per 100 g. How much protein tofu really gives, plus isoflavone and bone effects."),
    ("2026-11-09-en-egg-nutrition-benefits.md",
     "Egg Protein per 100 g: 12.6 g, 143 Calories, 6.3 g per Egg",
     "One hundred grams of egg, about two large eggs, has 143 calories and 12.56 g protein, or 6.3 g each. Boiling times, digestibility and cholesterol answered."),
    ("2026-11-07-en-chicken-breast-nutrition-benefits.md",
     "Chicken Breast Protein: 23.1 g per 100 g, 110 Calories",
     "Chicken breast has 23.1 g protein, 110 calories and 1.2 g fat per 100 g, a complete amino acid profile. Poaching that keeps it moist, plus protein timing."),
    ("2026-11-07-en-mackerel-nutrition-benefits.md",
     "Mackerel Nutrition per 100 g: 2,299 mg Omega-3, 205 kcal",
     "Mackerel has 205 calories, 18.6 g protein and 2,299 mg EPA plus DHA per 100 g. How much omega-3 one serving gives, and grilling versus braising retention."),
    ("2026-11-11-en-oyster-nutrition-benefits.md",
     "Oyster Nutrition: 16.6 mg Zinc, 7.1 g Protein per 100 g",
     "Raw oysters have 68 calories, 7.1 g protein, 16.6 mg zinc and 5.1 mg iron per 100 g. Why oysters rank first for zinc, plus norovirus and cooking guidance."),
    ("2026-11-07-en-garlic-nutrition-benefits.md",
     "Garlic Nutrition: 149 Calories, Allicin & 31 mg Vitamin C",
     "Raw garlic has 149 calories, 31.2 mg vitamin C and 6.4 g protein per 100 g. How crushing and resting 10 minutes raises allicin, and how much to eat a day."),
    ("2026-11-04-en-onion-nutrition-benefits.md",
     "Onion Nutrition: 40 Calories, 1.7 g Fiber, Quercetin",
     "Onion has 40 calories, 1.7 g fiber and 7.4 mg vitamin C per 100 g. How cooking shifts quercetin, why soaking leaches it, and gentler ways to cut the bite."),
    ("2026-11-04-en-blueberry-nutrition-benefits.md",
     "Blueberry Nutrition: 57 Calories, Anthocyanins per 100 g",
     "Blueberries have 57 calories, 2.4 g fiber and 9.7 mg vitamin C per 100 g. Fresh vs frozen anthocyanins, how much a day, and kidney or warfarin cautions."),
    ("2026-11-07-en-apple-nutrition-benefits.md",
     "Apple Nutrition: 52 Calories, 2.4 g Fiber per 100 g",
     "An apple has 52 calories, 2.4 g fiber, 107 mg potassium and pectin per 100 g. What the peel adds, whether a morning apple matters, and blood sugar context."),
    ("2026-11-09-en-shrimp-nutrition-benefits.md",
     "Shrimp Nutrition: 20.1 g Protein, 85 Calories, Creatinine",
     "Shrimp has 85 calories, 20.1 g protein and 1.34 mg zinc per 100 g. How shrimp affects a creatinine test, the cholesterol myth, shells and allergy cautions."),
    ("2026-11-13-en-squid-nutrition-benefits.md",
     "Squid Nutrition: 15.6 g Protein, 92 Calories, Taurine",
     "Raw squid has 92 calories, 15.6 g protein and 1.4 g fat per 100 g, rich in taurine. What taurine does for bile acids and liver lipids, plus cooking losses."),
    ("2026-11-04-en-tomato-nutrition-benefits.md",
     "Tomato Nutrition: 18 Calories, 13.7 mg Vitamin C, Lycopene",
     "A raw tomato has 18 calories, 13.7 mg vitamin C and 237 mg potassium per 100 g. Why cooking it with fat raises lycopene absorption, and reflux cautions."),
    ("2026-11-10-en-avocado-nutrition-benefits.md",
     "Avocado Nutrition: 160 Calories, 485 mg Potassium",
     "Avocado has 160 calories, 6.7 g fiber, 485 mg potassium and 14.7 g fat per 100 g, mostly oleic acid. Ripeness test, browning, and how much to eat a day."),
    ("2026-11-12-en-orange-nutrition-benefits.md",
     "Orange Nutrition: 47 Calories, 53.2 mg Vitamin C",
     "An orange has 47 calories, 53.2 mg vitamin C and 30 mcg folate per 100 g. Hesperidin research, whole fruit versus juice, and drug interaction cautions."),
    ("2026-11-12-en-cabbage-nutrition-benefits.md",
     "Cabbage Nutrition: 25 Calories, 36.6 mg Vitamin C",
     "Raw cabbage has 25 calories, 36.6 mg vitamin C and 76 mcg vitamin K per 100 g. Vitamin U research, how cooking changes it, and thyroid-related notes."),
    ("2026-11-13-en-pork-tenderloin-nutrition-benefits.md",
     "Pork Tenderloin Nutrition: 120 Calories, 21.8 g Protein",
     "Pork tenderloin has 120 calories, 21.8 g protein and 2.8 g fat per 100 g, plus 420 mg potassium. Thiamine for energy metabolism and tender cooking methods."),
    ("2026-11-06-en-beef-sirloin-nutrition-benefits.md",
     "Beef Sirloin Nutrition: 201 Calories, 20.3 g Protein",
     "Beef sirloin has 201 calories, 20.3 g protein, 1.48 mg heme iron and 3.55 mg zinc per 100 g. How heme iron absorbs, leaner cuts, and grilling safety."),
    ("2026-11-06-en-salmon-nutrition-benefits.md",
     "Salmon Nutrition: 208 Calories, 2,150 mg Omega-3",
     "Salmon has 208 calories, 20.4 g protein and 2,150 mg EPA plus DHA per 100 g. Wild versus farmed, smoked sodium, and how many servings a week to aim for."),
]

apply = "--apply" in sys.argv
problems = []
for name, title, desc in DATA:
    path = POSTS / name
    text = path.read_text(encoding="utf-8")
    tl, dl = len(title), len(desc)
    flag = ""
    if not (48 <= tl <= 62):
        flag += f" TITLE_LEN={tl}"
        problems.append((name, "title", tl))
    if not (130 <= dl <= 155):
        flag += f" DESC_LEN={dl}"
        problems.append((name, "desc", dl))
    print(f"{tl:3d} {dl:3d}  {name}{flag}")
    if not apply:
        continue
    if not 48 <= tl <= 62 or not 130 <= dl <= 155:
        continue
    new = re.sub(r'^title: ".*"$', f'title: "{title}"', text, count=1, flags=re.M)
    new = re.sub(r'^description: ".*"$', f'description: "{desc}"', new, count=1, flags=re.M)
    new = re.sub(r"^last_modified_at: .*$", "last_modified_at: 2026-11-23 09:10:00 +0900", new, count=1, flags=re.M)
    if new == text:
        print(f"  !! no change applied to {name}")
    else:
        path.write_text(new, encoding="utf-8")

print("\nproblems:", problems if problems else "none")
