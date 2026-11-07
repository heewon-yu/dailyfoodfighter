import os
import re

POSTS_DIR = 'dailyfoodfighter/_posts'

# 식재료별 궁합 및 FAQ 데이터 (국문 / 영문)
DATA = {
    'tomato': {
        'ko': {
            'pairings': '''## 6. 함께 먹으면 시너지가 폭발하는 식재료 궁합

- **[소고기 등심 (Beef Sirloin)]({{ site.baseurl }}/posts/beef-sirloin-nutrition-benefits/)**: 지용성 항산화제인 리코펜(Lycopene)은 소고기의 불포화지방산과 함께 조리될 때 체내 흡수율이 최대 4배까지 증가하며, 토마토의 유기산이 육류 단백질 소화를 촉진합니다.
- **[브로콜리 (Broccoli)]({{ site.baseurl }}/posts/broccoli-nutrition-benefits/)**: 미국 일리노이대 연구에 따르면 브로콜리의 설포라판과 토마토의 리코펜을 동시 섭취할 경우 전립선암 세포 증식 억제 시너지가 개별 섭취 대비 52% 이상 강화됩니다.
- **[양파 (Onion)]({{ site.baseurl }}/posts/onion-nutrition-benefits/)**: 양파의 케르세틴과 토마토의 나린제닌이 복합 작용하여 모세혈관 탄력을 강화하고 혈관벽의 죽상 플라크 형성을 강력히 차단합니다.''',
            'faq': [
                ("토마토는 생으로 먹는 것과 익혀 먹는 것 중 어느 쪽이 영양상 더 유리한가요?",
                 "익혀 드시는 것이 리코펜 흡수에 훨씬 유리합니다. 열을 가하면 단단한 식물 세포벽이 붕괴되면서 트랜스-리코펜이 인체 흡수율이 높은 시스-리코펜으로 전환되며, 올리브유 등 식물성 기름과 함께 조리 시 흡수율이 최대 4~5배까지 증가합니다."),
                ("공복에 토마토를 섭취하면 위장 장애나 속쓰림이 발생할 수 있나요?",
                 "네, 위벽이 약한 분은 주의가 필요합니다. 토마토에 함유된 수용성 펙틴과 타닌산 성분이 위산과 결합하면 용해되기 어려운 겔(Gel) 덩어리를 형성하여 위 내부 압력을 높이고 위통이나 역류성 식도염 증상을 유발할 수 있습니다."),
                ("방울토마토와 일반 대토마토의 영양 성분 차이는 무엇인가요?",
                 "단위 무게(100g)당 비타민 C, 비타민 A, 플라보노이드 함량은 방울토마토가 일반 토마토보다 1.5~2배가량 더 높습니다. 껍질 비율이 높아 식이섬유와 리코펜도 더 풍부하게 섭취할 수 있습니다.")
            ]
        },
        'en': {
            'pairings': '''## 6. Synergistic Food Pairings for Maximum Nutrient Absorption

- **[Beef Sirloin]({{ site.baseurl }}/en/posts/beef-sirloin-nutrition-benefits/)**: Fat-soluble lycopene requires dietary lipids for optimal bioavailability; pairing cooked tomatoes with high-quality beef fat enhances carotenoid absorption by up to fourfold while digestive acids in tomatoes aid meat proteolysis.
- **[Broccoli]({{ site.baseurl }}/en/posts/broccoli-nutrition-benefits/)**: Clinical research demonstrates that combining broccoli's sulforaphane with tomato's lycopene produces a synergistic anti-proliferative effect against oncogenic cellular pathways significantly exceeding individual consumption.
- **[Onion]({{ site.baseurl }}/en/posts/onion-nutrition-benefits/)**: The combination of quercetin in onions and naringenin in tomatoes fortifies microvascular endothelial integrity and attenuates systemic arterial stiffness.''',
            'faq': [
                ("Is it better to consume tomatoes raw or cooked for optimal health benefits?",
                 "Cooking tomatoes significantly enhances lycopene bioavailability. Thermal processing disrupts plant cell walls, transforming trans-lycopene into the more absorbable cis-isomer, which increases systemic absorption up to fourfold when consumed with healthy fats."),
                ("Can eating tomatoes on an empty stomach trigger gastrointestinal discomfort?",
                 "Yes, individuals with sensitive gastric mucosa may experience discomfort. Soluble pectin and tannic acids in raw tomatoes interact with gastric hydrochloric acid, potentially forming insoluble aggregates that increase intraluminal gastric pressure."),
                ("Do cherry tomatoes offer nutritional advantages over regular standard tomatoes?",
                 "Per 100 grams, cherry tomatoes exhibit higher concentrations of vitamin C, polyphenols, and dietary fiber due to their elevated skin-to-flesh ratio, delivering denser micronutrient payloads per serving.")
            ]
        }
    },
    'blueberry': {
        'ko': {
            'pairings': '''## 6. 함께 먹으면 시너지가 폭발하는 식재료 궁합

- **[연어 (Salmon)]({{ site.baseurl }}/posts/salmon-nutrition-benefits/)**: 블루베리의 안토시아닌과 연어의 오메가-3 DHA·EPA가 뇌혈관 장벽(BBB)을 통과하여 신경세포막 산화 손상을 이중으로 방어하고 인지 기능 감퇴를 방지합니다.
- **[사과 (Apple)]({{ site.baseurl }}/posts/apple-nutrition-benefits/)**: 사과의 수용성 펙틴과 블루베리의 안토시아닌이 결합하여 장내 유익균의 아세테이트 생성을 촉진하고 항염증 면역 환경을 극대화합니다.
- **[브로콜리 (Broccoli)]({{ site.baseurl }}/posts/broccoli-nutrition-benefits/)**: 비타민 C와 안토시아닌의 결합으로 세포질 내 글루타치온 환원 효소 활성을 유도하여 강력한 전신 항산화 네트워크를 형성합니다.''',
            'faq': [
                ("냉동 블루베리가 생블루베리보다 안토시아닌 함량이 더 높다는 것이 사실인가요?",
                 "네, 사실입니다. 수확 직후 급속 냉동 과정에서 세포벽이 팽창·미세 균열을 일으켜 껍질 속에 응축된 안토시아닌과 폴리페놀이 소화관 내에서 훨씬 더 쉽게 용출되어 생체이용률이 최대 20% 증가합니다."),
                ("블루베리 껍질 표면의 하얀 가루는 잔류 농약인가요?",
                 "아닙니다. '과분(Bloom)'이라 불리는 천연 식물성 왁스 보호막입니다. 과실 스스로 수분 증발을 막고 외부 미생물 침입을 방어하기 위해 분비하는 물질로, 과분이 균일하게 덮여 있을수록 신선하고 당도가 높은 최상품입니다."),
                ("성인 기준 블루베리의 가장 이상적인 하루 섭취량은 얼마인가요?",
                 "임상 연구에서 유의미한 항산화 및 혈관 확장 효과를 나타낸 권장 섭취량은 하루 약 100~130g(종이컵 1컵 분량, 약 50~70알) 내외입니다. 과다 섭취 시 과당으로 인한 장내 가스 팽만을 유발할 수 있습니다.")
            ]
        },
        'en': {
            'pairings': '''## 6. Synergistic Food Pairings for Maximum Nutrient Absorption

- **[Salmon]({{ site.baseurl }}/en/posts/salmon-nutrition-benefits/)**: The combination of anthocyanins and omega-3 fatty acids crosses the blood-brain barrier synergistically, attenuating neuroinflammatory cascades and preserving microvascular cerebral perfusion.
- **[Apple]({{ site.baseurl }}/en/posts/apple-nutrition-benefits/)**: Soluble pectin from apples and anthocyanin flavonoids from blueberries optimize the colonic microenvironment, stimulating beneficial butyrate and acetate production.
- **[Broccoli]({{ site.baseurl }}/en/posts/broccoli-nutrition-benefits/)**: Vitamin C from broccoli recycles oxidized anthocyanins, reinforcing cellular glutathione reductase networks and systemic cellular antioxidant defenses.''',
            'faq': [
                ("Are frozen blueberries nutritionally superior to fresh raw blueberries?",
                 "Yes, flash-freezing immediately post-harvest induces micro-fractures in the anthocyanin-rich plant epidermal cells, rendering polyphenols more bioaccessible and bioavailable during human digestion."),
                ("Is the white powdery substance on blueberry skin a pesticide residue?",
                 "No, it is a natural plant coating called 'epicuticular wax' or 'bloom.' It protects the berry against moisture loss and bacterial infestation; a prominent bloom is a hallmark of peak freshness."),
                ("What is the clinically validated optimal daily intake of blueberries for adults?",
                 "Intervention trials report optimal vascular and cognitive improvements with approximately 100 to 130 grams (one standard cup, roughly 50 to 70 berries) consumed daily.")
            ]
        }
    },
    'onion': {
        'ko': {
            'pairings': '''## 6. 함께 먹으면 시너지가 폭발하는 식재료 궁합

- **[소고기 등심 (Beef Sirloin)]({{ site.baseurl }}/posts/beef-sirloin-nutrition-benefits/)**: 양파의 황화알릴(Allicin 전구체)이 소고기의 비타민 B1과 결합하여 체내 흡수율이 10배 높은 '알리티아민'을 합성, 피로 회복과 단백질 대사를 가속합니다.
- **[사과 (Apple)]({{ site.baseurl }}/posts/apple-nutrition-benefits/)**: 양파와 사과는 식물계에서 케르세틴 농도가 가장 높은 두 식재료로, 함께 섭취 시 기관지 평활근 이완과 항히스타민 시너지가 폭발적으로 상승합니다.
- **[연어 (Salmon)]({{ site.baseurl }}/posts/salmon-nutrition-benefits/)**: 양파의 유기황 화합물이 혈소판 응집을 억제하고 연어의 EPA 성분과 상호작용하여 혈액 점도를 개선하고 중성지방 수치를 강하시킵니다.''',
            'faq': [
                ("양파를 가열 조리하면 매운맛이 사라지면서 핵심 영양소가 파괴되나요?",
                 "아닙니다. 양파의 핵심 플라보노이드인 케르세틴은 열 안정성이 매우 뛰어나 끓이거나 볶아도 85% 이상 파괴되지 않고 유지됩니다. 매운 황화알릴 성분은 가열 시 단맛을 내는 프로필메르캅탄으로 전환되어 위장 자극을 줄여줍니다."),
                ("양파 껍질을 차로 끓여 마시는 것이 실제 건강에 도움이 되나요?",
                 "매우 유익합니다. 양파의 가장 바깥쪽 갈색 껍질에는 과육 부분보다 케르세틴이 무려 30~50배 이상 농축되어 있습니다. 깨끗이 씻은 양파 껍질을 우려낸 물을 마시면 강력한 항산화 및 혈압 강하 효과를 얻을 수 있습니다."),
                ("양파를 썰 때 눈물을 흘리지 않게 하는 과학적인 방법이 있나요?",
                 "양파를 썰기 15분 전 냉장고에 넣어 차갑게 식히면 최루성 물질(신-프로판티알-S-옥사이드)을 생성하는 효소 활성이 둔화됩니다. 또한 날카롭게 갈린 칼날을 물에 적셔 자르면 휘발성 가스의 분산을 최소화할 수 있습니다.")
            ]
        },
        'en': {
            'pairings': '''## 6. Synergistic Food Pairings for Maximum Nutrient Absorption

- **[Beef Sirloin]({{ site.baseurl }}/en/posts/beef-sirloin-nutrition-benefits/)**: Allyl sulfides in onions conjugate with thiamine (vitamin B1) from beef to synthesize allithiamine, an active lipid-soluble molecule accelerating ATP cellular energy generation.
- **[Apple]({{ site.baseurl }}/en/posts/apple-nutrition-benefits/)**: Pairing onions and apples consolidates premier dietary quercetin reserves, delivering potent mast cell stabilization and bronchial anti-inflammatory relief.
- **[Salmon]({{ site.baseurl }}/en/posts/salmon-nutrition-benefits/)**: Organosulfur compounds in onions synergize with eicosapentaenoic acid (EPA) in salmon to inhibit platelet aggregation and reduce vascular thrombus susceptibility.''',
            'faq': [
                ("Does cooking onions destroy their fundamental cardioprotective nutrients?",
                 "No. Quercetin exhibits remarkable thermal stability, retaining over 85% of its molecular integrity through sautéing and boiling. Heat converts volatile lachrymatory alliinase products into sweet-tasting, stomach-friendly propyl mercaptans."),
                ("Is brewing onion skins into tea scientifically backed for health benefits?",
                 "Yes. The outer pigmented tunic of onions contains 30 to 50 times higher concentrations of quercetin aglycones compared to the inner edible fleshy scales, serving as an exceptional cardioprotective elixir."),
                ("What biochemical technique effectively minimizes crying when slicing onions?",
                 "Chilling onions for 15 to 30 minutes before cutting depresses lachrymatory factor synthase enzyme kinetics. Utilizing a razor-sharp, moist blade minimizes mechanical cell rupture and subsequent airborne aerosolization.")
            ]
        }
    },
    'broccoli': {
        'ko': {
            'pairings': '''## 6. 함께 먹으면 시너지가 폭발하는 식재료 궁합

- **[마늘 (Garlic)]({{ site.baseurl }}/posts/garlic-nutrition-benefits/)**: 마늘에 풍부한 유기황 화합물과 셀레늄이 브로콜리의 설포라판(Sulforaphane)과 상호작용하여 간 해독 2단계 효소(글루타치온-S-전이효소)를 강력하게 유도합니다.
- **[토마토 (Tomato)]({{ site.baseurl }}/posts/tomato-nutrition-benefits/)**: 토마토의 지용성 리코펜과 브로콜리의 수용성 설포라판은 인체 내 암세포 증식 경로를 다각도로 억제하는 상호 보완적 항암 시너지를 냅니다.
- **[연어 (Salmon)]({{ site.baseurl }}/posts/salmon-nutrition-benefits/)**: 브로콜리의 풍부한 칼슘과 비타민 K가 연어의 비타민 D와 결합하여 조골세포의 골기질 형성을 촉진하고 골다공증을 예방합니다.''',
            'faq': [
                ("브로콜리를 조리할 때 설포라판 파괴를 막는 가장 이상적인 방법은?",
                 "끓는 물에 삶지 말고 찜기에 올려 1~3분간 가볍게 찌는 방식이 최선입니다. 미로시나아제(Myrosinase) 효소는 고열에 취약하므로 스팀 조리 후 고추냉이나 겨자, 다진 마늘을 곁들이면 설포라판 생성을 2배 이상 촉진할 수 있습니다."),
                ("브로콜리 줄기 부분도 버리지 않고 먹는 것이 영양상 이득인가요?",
                 "그렇습니다. 줄기 부분에는 꽃송이보다 식이섬유와 칼슘, 비타민 C 함량이 더 높습니다. 단단한 겉껍질을 살짝 벗겨내고 얇게 썰어 조리하면 풍부한 식감과 영양소를 온전히 섭취할 수 있습니다."),
                ("갑상선 질환 환자가 브로콜리를 섭취하면 요오드 흡수가 저해되나요?",
                 "생으로 매일 대량(1kg 이상) 섭취하지 않는 한 일반적인 섭취량은 안전합니다. 브로콜리의 고이트로겐(Goitrogen) 성분은 가열 조리 시 80% 이상 불활성화되므로 익혀서 섭취하면 아무런 문제가 없습니다.")
            ]
        },
        'en': {
            'pairings': '''## 6. Synergistic Food Pairings for Maximum Nutrient Absorption

- **[Garlic]({{ site.baseurl }}/en/posts/garlic-nutrition-benefits/)**: Organosulfur complexes and selenium in garlic activate Phase II hepatic detoxification enzymes, amplifying sulforaphane-mediated chemoprotective efficacy.
- **[Tomato]({{ site.baseurl }}/en/posts/tomato-nutrition-benefits/)**: Cross-pollination of tomato lycopene and broccoli isothiocyanates simultaneously inhibits neoplastic angiogenesis across divergent biochemical signaling cascades.
- **[Salmon]({{ site.baseurl }}/en/posts/salmon-nutrition-benefits/)**: High bioavailable calcium and phylloquinone (vitamin K1) in broccoli work in synergy with cholecalciferol (vitamin D3) from salmon to accelerate bone osteocalcin carboxylation.''',
            'faq': [
                ("What is the optimal culinary preparation to preserve sulforaphane in broccoli?",
                 "Steaming for 1 to 3 minutes preserves the heat-sensitive myrosinase enzyme. Pairing lightly steamed broccoli with myrosinase-rich condiments like mustard seed, wasabi, or raw garlic doubles sulforaphane yields."),
                ("Should broccoli stems be consumed alongside the florets for nutritional value?",
                 "Absolutely. The fibrous stalks contain denser concentrations of soluble fiber, calcium, and ascorbic acid than the delicate florets; simply peel the tough outer epidermis before culinary prep."),
                ("Does broccoli consumption interfere with thyroid endocrine function in patients with goiter?",
                 "Only massive, prolonged raw intake presents clinical relevance. Gentle thermal cooking denatures over 80% of dietary goitrogens, eliminating interference with thyroidal iodine organification.")
            ]
        }
    },
    'beef-sirloin': {
        'ko': {
            'pairings': '''## 6. 함께 먹으면 시너지가 폭발하는 식재료 궁합

- **[양파 (Onion)]({{ site.baseurl }}/posts/onion-nutrition-benefits/)**: 양파의 알릴 화합물이 소고기의 비타민 B1 흡수율을 10배 높여 활성형 알리티아민을 생성하며, 퀘르세틴이 육류 섭취로 인한 산화 콜레스테롤 생성을 차단합니다.
- **[마늘 (Garlic)]({{ site.baseurl }}/posts/garlic-nutrition-benefits/)**: 마늘의 알리신 성분이 소고기 지방 대사를 원활하게 하고 고온 조리 시 발생하는 발암물질인 헤테로사이클릭아민(HCA) 생성을 억제합니다.
- **[토마토 (Tomato)]({{ site.baseurl }}/posts/tomato-nutrition-benefits/)**: 토마토의 비타민 C와 사과산이 소고기 속 헴철(Heme Iron)의 흡수율을 3배 이상 끌어올리고 소화 효소 분비를 돕습니다.''',
            'faq': [
                ("붉은 고기(적색육) 섭취 시 대장암 발병 위험을 낮추는 과학적인 섭취법은?",
                 "고기를 직화로 태우지 않고 수육, 찜, 중불 팬 조리로 조리하며, 마늘·양파·브로콜리 등 항산화 채소를 1:2 비율로 곁들여 헤테로사이클릭아민(HCA)과 다환방향족탄화수소(PAH) 흡수를 방어하는 것이 핵심입니다."),
                ("소고기 등심의 지방(마블링)은 건강에 무조건 해로운가요?",
                 "그렇지 않습니다. 소고기 지방산의 약 50%는 혈중 유익한 HDL을 높이고 LDL을 낮추는 올레산(Oleic acid, 단일불포화지방산)으로 구성되어 있습니다. 적정량 섭취 시 에너지 대사와 지용성 비타민 흡수에 긍정적입니다."),
                ("소고기를 레어나 미디엄으로 덜 익혀 먹을 때의 영양학적 이점은?",
                 "단백질 변성률이 낮아 아미노산 손실이 적고 비타민 B군과 헴철의 열 손상이 최소화됩니다. 신선도가 보장된 소고기는 중심부 온도 55~60℃ 수준에서 조리할 때 소화 흡수율과 영양 밀도가 가장 우수합니다.")
            ]
        },
        'en': {
            'pairings': '''## 6. Synergistic Food Pairings for Maximum Nutrient Absorption

- **[Onion]({{ site.baseurl }}/en/posts/onion-nutrition-benefits/)**: Onion allyl sulfides bind thiamine from beef into lipophilic allithiamine, while quercetin scavenges oxidized lipid radicals during gastric digestion.
- **[Garlic]({{ site.baseurl }}/en/posts/garlic-nutrition-benefits/)**: Allicin and diallyl trisulfide suppress heterocyclic amine (HCA) formation during meat searing while supporting postprandial lipid metabolism.
- **[Tomato]({{ site.baseurl }}/en/posts/tomato-nutrition-benefits/)**: Ascorbic and malic acids in tomatoes convert ferric iron into highly absorbable ferrous heme iron, tripling systemic iron bioavailability.''',
            'faq': [
                ("How can one scientifically mitigate carcinogenic risks associated with red meat consumption?",
                 "Avoid direct flame charring; cook with indirect moist heat, and co-ingest cruciferous vegetables and allium vegetables at a 2:1 ratio to neutralize heterocyclic amines and preserve intestinal mucosal health."),
                ("Is the intermuscular marbling fat in beef sirloin detrimental to cardiovascular health?",
                 "Not entirely. Approximately 50% of the fatty acids in quality beef sirloin consist of oleic acid, a monounsaturated fatty acid known to optimize HDL-to-LDL cholesterol ratios when eaten in moderation."),
                ("Does cooking beef to rare or medium-rare preserve micronutrient integrity better than well-done?",
                 "Yes. Cooking meat to core temperatures of 55°C to 60°C minimizes amino acid cross-linking and prevents thermal denaturation of thiamine, cobalamin, and bioactive heme iron complexes.")
            ]
        }
    },
    'salmon': {
        'ko': {
            'pairings': '''## 6. 함께 먹으면 시너지가 폭발하는 식재료 궁합

- **[브로콜리 (Broccoli)]({{ site.baseurl }}/posts/broccoli-nutrition-benefits/)**: 연어의 비타민 D3가 브로콜리의 칼슘과 인 흡수를 촉진하고, 비타민 C가 연어의 강력한 카로티노이드 항산화제인 아스타잔틴을 보호합니다.
- **[마늘 (Garlic)]({{ site.baseurl }}/posts/garlic-nutrition-benefits/)**: 마늘의 유기황 화합물이 연어의 EPA·DHA 불포화지방산 산화를 막고 혈관 내피세포 혈류 개선 시너지를 배가합니다.
- **[양파 (Onion)]({{ site.baseurl }}/posts/onion-nutrition-benefits/)**: 양파의 케르세틴이 연어의 지방질 소화를 돕고 비린내를 중화하며 혈중 중성지방 배출을 유도합니다.''',
            'faq': [
                ("생연어와 훈제연어의 영양학적 차이는 무엇인가요?",
                 "생연어는 열에 취약한 오메가-3 지방산과 비타민 B군이 온전히 보존되어 있는 반면, 훈제연어는 가공 과정에서 나트륨 함량이 5~10배 증가하므로 고혈압 환자는 생연어나 구이 형태 섭취가 훨씬 안전합니다."),
                ("연어 껍질도 버리지 않고 함께 먹는 것이 좋은가요?",
                 "매우 권장됩니다. 연어 껍질 바로 밑의 피하지방층에는 오메가-3 불포화지방산과 저분자 어류 콜라겐이 고농도로 농축되어 있어, 바삭하게 구워 드시면 관절과 피부 건강에 최상의 영양을 제공합니다."),
                ("대형 어류인 연어의 중금속(수은) 축적 위험은 안전한 수준인가요?",
                 "연어는 먹이사슬 하위 단계의 소형 플랑크톤과 어류를 주로 섭취하므로 참치나 상어 등 최상위 포식자에 비해 수은 농도가 현저히 낮아 임산부와 수유부도 주 2~3회 안심하고 섭취할 수 있는 안전 어종입니다.")
            ]
        },
        'en': {
            'pairings': '''## 6. Synergistic Food Pairings for Maximum Nutrient Absorption

- **[Broccoli]({{ site.baseurl }}/en/posts/broccoli-nutrition-benefits/)**: Cholecalciferol (vitamin D3) in salmon maximizes intestinal absorption of dietary calcium from broccoli, while ascorbic acid recycles astaxanthin radicals.
- **[Garlic]({{ site.baseurl }}/en/posts/garlic-nutrition-benefits/)**: Allium sulfur compounds protect delicate double-bond polyunsaturated fatty acids from peroxidative breakdown during cooking and circulation.
- **[Onion]({{ site.baseurl }}/en/posts/onion-nutrition-benefits/)**: Flavonoid quercetin enhances fatty acid beta-oxidation, facilitating postprandial triglyceride clearance and vascular tonus optimization.''',
            'faq': [
                ("What nutritional disparities distinguish fresh raw salmon from commercial smoked salmon?",
                 "Fresh salmon preserves thermal-sensitive omega-3 EPA/DHA and cobalamin without additive sodium, whereas smoked preparations frequently exhibit 500% to 1000% higher sodium concentrations."),
                ("Does consuming crispy salmon skin provide tangible biochemical advantages?",
                 "Yes. The subdermal adipose layer immediately beneath the salmon epidermis concentrates long-chain marine omega-3s and bioavailable marine collagen peptides supporting connective tissue."),
                ("Is bioaccumulated methylmercury a realistic safety concern when consuming salmon regularly?",
                 "No. Salmon feeds relatively low on the marine trophic pyramid, exhibiting negligible methylmercury accumulation compared to apex predatory pelagic fish like swordfish or albacore tuna.")
            ]
        }
    },
    'apple': {
        'ko': {
            'pairings': '''## 6. 함께 먹으면 시너지가 폭발하는 식재료 궁합

- **[연어 (Salmon)]({{ site.baseurl }}/posts/salmon-nutrition-benefits/)**: 사과의 수용성 펙틴과 케르세틴이 연어의 불포화지방산 산화를 억제하고 혈관 내피세포의 산화질소(NO) 합성을 촉진합니다.
- **[양파 (Onion)]({{ site.baseurl }}/posts/onion-nutrition-benefits/)**: 양파와 사과는 식물계 최고의 케르세틴 복합체로, 기관지 평활근 이완과 항염증·항알레르기 방어선을 강화합니다.
- **[브로콜리 (Broccoli)]({{ site.baseurl }}/posts/broccoli-nutrition-benefits/)**: 브로콜리의 설포라판과 사과의 파이토케미컬이 결합하여 간 해독 경로를 활성화하고 유해 활성산소를 소거합니다.''',
            'faq': [
                ("사과는 아침에 먹으면 금사과, 저녁에 먹으면 독사과라는 말이 사실인가요?",
                 "의학적으로 독이 되는 것은 전혀 아닙니다. 다만 사과의 유기산이 위산 분비를 자극해 역류성 식도염이 있는 경우 속쓰림을 유발할 수 있고, 펙틴의 장 운동 촉진으로 숙면을 방해할 수 있어 아침 섭취를 더 권장하는 것입니다."),
                ("당뇨 환자가 사과를 매일 섭취해도 혈당에 무리가 없나요?",
                 "적정량(하루 1/2~1개) 섭취는 안전하며 오히려 인슐린 저항성 개선에 유익합니다. 사과의 혈당지수(GI)는 36으로 낮고, 수용성 섬유질 펙틴이 포도당 흡수 속도를 지연시켜 급격한 혈당 스파이크를 방지합니다."),
                ("갈변된 사과를 먹어도 건강에 해롭지 않나요?",
                 "사과의 폴리페놀이 산화되어 갈색으로 변한 것으로 유해한 독소는 아닙니다. 다만 폴리페놀의 항산화 활성이 다소 감소하므로 깎은 즉시 드시거나 묽은 소금물, 레몬수에 담가두면 갈변을 방지할 수 있습니다.")
            ]
        },
        'en': {
            'pairings': '''## 6. Synergistic Food Pairings for Maximum Nutrient Absorption

- **[Salmon]({{ site.baseurl }}/en/posts/salmon-nutrition-benefits/)**: Soluble pectin and quercetin protect long-chain polyunsaturated fatty acids from oxidation and stimulate endothelial nitric oxide bioavailability.
- **[Onion]({{ site.baseurl }}/en/posts/onion-nutrition-benefits/)**: Combining apples and onions merges dietary quercetin fractions, elevating systemic anti-inflammatory resilience and microcirculatory integrity.
- **[Broccoli]({{ site.baseurl }}/en/posts/broccoli-nutrition-benefits/)**: Cross-synergy between apple flavonoids and cruciferous sulforaphane activates intracellular Nrf2-ARE antioxidant response elements.''',
            'faq': [
                ("Is there scientific truth behind the proverb 'Gold in the morning, poison at night' regarding apples?",
                 "It is a clinical myth. Apples are never toxic at night. However, organic malic acids stimulate gastric secretions, which might exacerbate acid reflux in sensitive recumbent individuals, making morning ingestion preferable."),
                ("Can diabetic individuals safely consume apples without provoking glycemic volatility?",
                 "Yes, one small-to-medium apple (GI ~36) daily is metabolically beneficial. Soluble pectin matrices decelerate intestinal carbohydrate uptake, smoothing postprandial glucose transitions."),
                ("Does enzymatic browning on sliced apples pose metabolic or toxic risks?",
                 "No. Polyphenol oxidase turns exposed polyphenols into brown melanoid pigments. While this marginally depletes antioxidant potency, no cellular toxicity occurs. A lemon water dip prevents this enzymic oxidation.")
            ]
        }
    },
    'garlic': {
        'ko': {
            'pairings': '''## 6. 함께 먹으면 시너지가 폭발하는 식재료 궁합

- **[소고기 등심 (Beef Sirloin)]({{ site.baseurl }}/posts/beef-sirloin-nutrition-benefits/)**: 마늘의 알리신이 소고기의 비타민 B1과 결합해 지용성 알리티아민을 형성하여 만성 피로를 회복하고 단백질 합성을 촉진합니다.
- **[연어 (Salmon)]({{ site.baseurl }}/posts/salmon-nutrition-benefits/)**: 마늘의 유기황 화합물이 연어의 오메가-3 지방산 산화를 방지하고 혈소판 응집을 막아 혈액 순환을 최적화합니다.
- **[토마토 (Tomato)]({{ site.baseurl }}/posts/tomato-nutrition-benefits/)**: 토마토의 지용성 리코펜과 마늘의 알릴디설파이드가 복합 작용하여 전립선 세포 및 심혈관벽의 산화 스트레스를 소거합니다.''',
            'faq': [
                ("흑마늘과 생마늘의 영양학적 효능 차이는 무엇인가요?",
                 "마늘을 일정 온도·습도에서 발효·숙성시킨 흑마늘은 매운맛이 사라지는 대신 수용성 황아미노산인 S-알릴시스테인(SAC) 함량이 급증하여 항산화 활성이 생마늘보다 최대 10배까지 높아지고 위장 자극이 현저히 줄어듭니다."),
                ("마늘을 가열 조리하면 알리신의 효능이 전부 사라지나요?",
                 "가열 시 알리신 생성 효소(Alliinase)가 불활성화되지만, 대신 아조엔(Ajoene)과 알릴설파이드 등 다른 혈관 확장 및 콜레스테롤 저하 물질이 새롭게 생성됩니다. 알리신을 최대한 보존하려면 마늘을 다진 후 10분간 공기 중에 방치한 뒤 조리하는 것이 비결입니다."),
                ("공복에 생마늘을 섭취했을 때 속쓰림을 방지하는 안전한 섭취법은?",
                 "생마늘의 알리신은 위점막을 강력하게 자극하므로 공복 섭취를 피하고, 꿀에 절여 섭취하거나 기름에 살짝 볶아 드시거나 식사 중간에 다른 음식과 함께 섭취해야 위점막 손상을 막을 수 있습니다.")
            ]
        },
        'en': {
            'pairings': '''## 6. Synergistic Food Pairings for Maximum Nutrient Absorption

- **[Beef Sirloin]({{ site.baseurl }}/en/posts/beef-sirloin-nutrition-benefits/)**: Garlic's allicin pairs with beef thiamine to generate allithiamine, an active cofactor maximizing glycogen resynthesis and mitochondrial bioenergetics.
- **[Salmon]({{ site.baseurl }}/en/posts/salmon-nutrition-benefits/)**: Organosulfur compounds safeguard polyunsaturated double bonds in salmon oil, suppressing vascular thromboxane synthesis.
- **[Tomato]({{ site.baseurl }}/en/posts/tomato-nutrition-benefits/)**: Diallyl sulfides in garlic enhance hepatic phase II enzymes while carotenoid lycopene neutralizes singlet oxygen in endothelial tissues.''',
            'faq': [
                ("What metabolic distinctions separate aged black garlic from fresh raw garlic cloves?",
                 "Controlled aging eliminates pungent allicin while yielding high concentrations of S-allyl-cysteine (SAC), a stable water-soluble organosulfur compound with tenfold greater free radical scavenging activity and zero gastric irritation."),
                ("Does thermal cooking completely deactivate allicin's functional bioactivity in garlic?",
                 "Heat denatures the alliinase enzyme, yet gives rise to ajoene and allyl polysulfides that retain cardiovascular efficacy. Slicing or crushing garlic and resting it for 10 minutes prior to heating ensures optimal allicin enzyme conversion."),
                ("How can one avoid gastric mucosal irritation when consuming raw garlic?",
                 "Never ingest raw crushed garlic on an empty stomach. Emulsify minced garlic with healthy cold-pressed oils, blend with meals, or lightly roast to mitigate direct epithelial contact irritation.")
            ]
        }
    }
}

def make_json_ld(faq_items):
    entities = []
    for q, a in faq_items:
        q_clean = q.replace('"', '\\"')
        a_clean = a.replace('"', '\\"')
        entities.append(f'''    {{
      "@type": "Question",
      "name": "{q_clean}",
      "acceptedAnswer": {{
        "@type": "Answer",
        "text": "{a_clean}"
      }}
    }}''')
    entity_str = ',\n'.join(entities)
    return f'''\n<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
{entity_str}
  ]
}}
</script>'''

def update_post(filename, ingredient_key, lang):
    filepath = os.path.join(POSTS_DIR, filename)
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 이미 FAQ나 6번이 들어가 있는지 확인
    if 'FAQPage' in content or '자주 묻는 질문' in content or 'Frequently Asked Questions' in content:
        print(f"Already updated: {filename}")
        return

    data = DATA[ingredient_key][lang]
    pairings_md = data['pairings']
    faq_items = data['faq']

    # FAQ Markdown 생성
    if lang == 'ko':
        faq_md = '## 7. 자주 묻는 질문 (FAQ)\n\n'
        for i, (q, a) in enumerate(faq_items, 1):
            faq_md += f'### Q{i}. {q}\n**A:** {a}\n\n'
    else:
        faq_md = '## 7. Frequently Asked Questions (FAQ)\n\n'
        for i, (q, a) in enumerate(faq_items, 1):
            faq_md += f'### Q{i}. {q}\n**A:** {a}\n\n'

    json_ld = make_json_ld(faq_items)

    addendum = f"\n\n---\n\n{pairings_md}\n\n---\n\n{faq_md.strip()}\n{json_ld}\n"
    content = content.rstrip() + addendum

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Successfully updated: {filename}")

# 기존 16개 포스트 파일 업데이트
files_map = {
    '2026-11-04-tomato-nutrition-benefits.md': ('tomato', 'ko'),
    '2026-11-04-en-tomato-nutrition-benefits.md': ('tomato', 'en'),
    '2026-11-04-blueberry-nutrition-benefits.md': ('blueberry', 'ko'),
    '2026-11-04-en-blueberry-nutrition-benefits.md': ('blueberry', 'en'),
    '2026-11-04-onion-nutrition-benefits.md': ('onion', 'ko'),
    '2026-11-04-en-onion-nutrition-benefits.md': ('onion', 'en'),
    '2026-11-05-broccoli-nutrition-benefits.md': ('broccoli', 'ko'),
    '2026-11-05-en-broccoli-nutrition-benefits.md': ('broccoli', 'en'),
    '2026-11-06-beef-sirloin-nutrition-benefits.md': ('beef-sirloin', 'ko'),
    '2026-11-06-en-beef-sirloin-nutrition-benefits.md': ('beef-sirloin', 'en'),
    '2026-11-06-salmon-nutrition-benefits.md': ('salmon', 'ko'),
    '2026-11-06-en-salmon-nutrition-benefits.md': ('salmon', 'en'),
    '2026-11-07-apple-nutrition-benefits.md': ('apple', 'ko'),
    '2026-11-07-en-apple-nutrition-benefits.md': ('apple', 'en'),
    '2026-11-07-garlic-nutrition-benefits.md': ('garlic', 'ko'),
    '2026-11-07-en-garlic-nutrition-benefits.md': ('garlic', 'en'),
}

for fname, (ing, lang) in files_map.items():
    update_post(fname, ing, lang)

print("All existing 16 posts updated with FAQ schema and Pairings internal links!")
