#!/usr/bin/env python3
"""네이버 애널리틱스 + GA4 스크립트를 독립 정적 HTML의 </head> 직전에 1회 삽입한다.
이미 삽입된 파일은 건너뛴다(멱등).
"""
import pathlib
import sys

NAVER = '1fdda5e32ec26f0'
GA4 = 'G-KBV8HQ5J6Z'

SNIPPET = """  <!-- Naver Analytics (wcslog) -->
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
changed, skipped, errors = [], [], []

for rel in TARGETS:
    p = root / rel
    if not p.exists():
        errors.append(f'MISSING {rel}')
        continue
    html = p.read_text(encoding='utf-8')
    if NAVER in html:
        skipped.append(rel)
        continue
    if '</head>' not in html:
        errors.append(f'NO_HEAD {rel}')
        continue
    if html.count('</head>') != 1:
        errors.append(f'MULTI_HEAD {rel}')
        continue
    html = html.replace('</head>', SNIPPET + '</head>', 1)
    p.write_text(html, encoding='utf-8')
    changed.append(rel)

print(f'changed={len(changed)} skipped={len(skipped)} errors={len(errors)}')
for c in changed:
    print('  +', c)
for s in skipped:
    print('  = already', s)
for e in errors:
    print('  !', e)
sys.exit(1 if errors else 0)
