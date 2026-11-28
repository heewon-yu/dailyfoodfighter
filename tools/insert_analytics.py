#!/usr/bin/env python3
"""네이버 애널리틱스 + GA4 블록을 독립 정적 HTML에 1회 삽입/갱신한다.

- `_includes/analytics.html`(Jekyll 공통 인클루드)을 정본으로 삼아 Liquid 변수를 실제 ID로 치환해 사용한다.
- 실서버 도메인(dailyfoodfighter.com / www.dailyfoodfighter.com)에서만 스크립트를 로드한다.
- 이미 ANALYTICS-START 블록이 있으면 그 블록만 교체(멱등), 이전 버전 블록이 있으면 그것도 교체.
"""
import pathlib
import sys

NAVER = '1fdda5e32ec26f0'
GA4 = 'G-KBV8HQ5J6Z'

START = '<!-- ANALYTICS-START'
END = '<!-- ANALYTICS-END -->'

# 2026-11-28 1차 삽입본(도메인 가드 없음) — 갱신 대상
LEGACY = """  <!-- Naver Analytics (wcslog) -->
  <script type="text/javascript" src="//wcs.pstatic.net/wcslog.js"></script>
  <script type="text/javascript">
  if(!wcs_add) var wcs_add = {};
  wcs_add["wa"] = "%(naver)s";
  if(window.wcs) {
    wcs_do();
  }
  </script>
  <!-- Google Analytics 4 (GA4) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=%(ga4)s"></script>
  <script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '%(ga4)s');
  </script>
""" % {'naver': NAVER, 'ga4': GA4}

TARGETS = [
    'air/index.html', 'air/calendar/index.html', 'air/first/index.html',
    'air/guide/index.html', 'air/journey/index.html', 'air/map/index.html',
    'air/mileage/index.html', 'air/new/index.html', 'air/route/index.html',
    'air/status/index.html',
    'benefits/index.html', 'benefits/privacy/index.html',
    'cal/index.html', 'card/index.html',
    'games/index.html',
    'games/300-seconds/index.html', 'games/300-seconds/privacy.html',
    'games/hormuz/index.html', 'games/rhythm-classic/index.html',
    'games/scalping-king/index.html', 'games/scalping-king/privacy/index.html',
    'games/scalping-king/delete-account/index.html',
    'hotel/index.html', 'macro/index.html', 'map/index.html',
    'apps/benefits/src/app.html',
]

root = pathlib.Path(__file__).resolve().parent.parent
snippet = (root / '_includes/analytics.html').read_text(encoding='utf-8')
snippet = snippet.replace('{{ site.naver_analytics }}', NAVER).replace('{{ site.google_analytics }}', GA4)
snippet = snippet.rstrip('\n') + '\n'

changed, skipped, errors = [], [], []

for rel in TARGETS:
    p = root / rel
    if not p.exists():
        errors.append(f'MISSING {rel}')
        continue
    html = p.read_text(encoding='utf-8')

    if START in html:
        s = html.index(START)
        e = html.index(END) + len(END)
        new = html[:s].rstrip(' \t') + '\n' + snippet + html[e:].lstrip('\n')
        if new == html:
            skipped.append(rel)
            continue
        p.write_text(new, encoding='utf-8')
        changed.append(rel)
        continue

    if LEGACY in html:
        p.write_text(html.replace(LEGACY, snippet, 1), encoding='utf-8')
        changed.append(rel)
        continue

    if '</head>' not in html or html.count('</head>') != 1:
        errors.append(f'HEAD {rel}')
        continue
    p.write_text(html.replace('</head>', snippet + '</head>', 1), encoding='utf-8')
    changed.append(rel)

print(f'changed={len(changed)} unchanged={len(skipped)} errors={len(errors)}')
for c in changed:
    print('  ~', c)
for e in errors:
    print('  !', e)
sys.exit(1 if errors else 0)
