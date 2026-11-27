#!/usr/bin/env node
/**
 * 블로그(/benefits/) 정적 빌드 후처리.
 *
 * 1) 생성된 HTML의 <head>에 구조화 데이터(JSON-LD)를 주입한다.
 *    - Svelte 5의 프리렌더 단계는 <svelte:head> 안의 <script> 태그를 만나면
 *      메모리 폭주로 빌드가 죽기 때문에, JSON-LD는 빌드 후 주입으로 처리한다.
 * 2) 제목·설명·OG/Twitter·robots 메타가 모두 있는지 검사하고, 없으면 빌드를 실패시킨다.
 *
 * 실행: EMBED_BENEFITS=1 npm run build:blog (package.json의 build:blog에서 자동 호출)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SITE = 'https://dailyfoodfighter.com';

const pages = [
  {
    file: 'build/index.html',
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          '@id': `${SITE}/benefits/#app`,
          name: '혜택찾기',
          alternateName: '쓸모있는 모음.zip 혜택찾기 — 정책·복지·지원금 검색',
          url: `${SITE}/benefits/`,
          description:
            '출산·육아·청년·주거·복지·정책자금 지원 정보를 공식 공고 기반으로 한곳에서 찾고 비교하는 검색 서비스입니다. 회원가입 없이 조건을 설정해 탐색할 수 있습니다.',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Any (웹 브라우저)',
          inLanguage: 'ko',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
          isPartOf: { '@type': 'WebSite', name: '쓸모있는 모음.zip', url: `${SITE}/` },
          publisher: {
            '@type': 'Organization',
            name: '쓸모있는 모음.zip',
            url: `${SITE}/`,
            sameAs: ['https://x.com/Dailyfoodfff']
          }
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: '쓸모있는 모음.zip', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: '혜택찾기', item: `${SITE}/benefits/` }
          ]
        }
      ]
    },
    required: [
      '<title>혜택찾기 | 정부지원금·청년·주거·출산육아·창업 정책자금 맞춤 검색</title>',
      'name="description"',
      'name="robots"',
      'rel="canonical"',
      'property="og:title"',
      'property="og:description"',
      'property="og:image"',
      'property="og:url"',
      'name="twitter:card"',
      'name="twitter:title"',
      'name="twitter:description"',
      'name="twitter:image"'
    ]
  },
  {
    file: 'build/privacy/index.html',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: '혜택찾기 개인정보 처리 안내',
      url: `${SITE}/benefits/privacy/`,
      inLanguage: 'ko',
      isPartOf: { '@type': 'WebApplication', name: '혜택찾기', url: `${SITE}/benefits/` },
      publisher: { '@type': 'Organization', name: '쓸모있는 모음.zip', url: `${SITE}/` }
    },
    required: [
      '<title>개인정보 처리방침 초안 | 혜택찾기</title>',
      'name="description"',
      'name="robots"',
      'rel="canonical"',
      'property="og:title"',
      'property="og:description"',
      'property="og:image"',
      'name="twitter:card"',
      'name="twitter:title"'
    ]
  }
];

let failed = false;

for (const page of pages) {
  if (!existsSync(page.file)) {
    console.error(`MISSING: ${page.file}`);
    failed = true;
    continue;
  }

  let html = readFileSync(page.file, 'utf8');
  const headEnd = html.indexOf('</head>');
  if (headEnd === -1) {
    console.error(`NO </head>: ${page.file}`);
    failed = true;
    continue;
  }

  const head = html.slice(0, headEnd);
  const missing = page.required.filter((needle) => !head.includes(needle));
  if (missing.length) {
    console.error(`META MISSING in ${page.file}: ${missing.join(', ')}`);
    failed = true;
  }

  if (!head.includes('application/ld+json')) {
    const tag = `  <script type="application/ld+json">${JSON.stringify(page.jsonLd)}</script>\n`;
    html = html.slice(0, headEnd) + tag + html.slice(headEnd);
    writeFileSync(page.file, html);
    console.log(`JSON-LD injected: ${page.file}`);
  } else {
    console.log(`JSON-LD already present: ${page.file}`);
  }
}

if (failed) process.exit(1);
console.log('HEAD META OK: title, description, robots, canonical, OG, Twitter, JSON-LD');
