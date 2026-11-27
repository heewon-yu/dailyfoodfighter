import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {nationalBaseKey,approvedNationalRepresentative} from '../src/lib/national-titles.ts';
import {displayRegion} from '../src/lib/region-visibility.ts';

const catalog=JSON.parse(readFileSync(new URL('../src/lib/national-catalog.json',import.meta.url),'utf8'));
const verified=catalog.filter(p=>p.verification_status==='VERIFIED');
const home={regionSido:'인천광역시',regionSigungu:'연수구'};

test('national manual catalog only exposes verified authoritative sources',()=>{
  const names=new Set();
  for(const p of verified){
    assert.equal(p.region_sido,'전국');
    assert.ok(p.verification_date);
    assert.ok(nationalBaseKey(p.title));
    assert.equal(approvedNationalRepresentative(p),true);
    assert.equal(displayRegion(p,home,'mine'),true);
    assert.ok(!names.has(p.title),'duplicate national base entry');
    names.add(p.title);
    const url=new URL(p.apply_url);
    assert.equal(url.protocol,'https:');
    assert.ok(['www.bokjiro.go.kr','m.bokjiro.go.kr','www.moe.go.kr','www.work24.go.kr'].includes(url.hostname));
  }
});
test('pending nationwide entries are never treated as source-verified',()=>{
  assert.ok(catalog.some(p=>p.verification_status==='PENDING_SOURCE_REVIEW'));
  for(const p of catalog.filter(p=>p.verification_status!=='VERIFIED')){
    assert.equal(p.verification_date,null);
  }
});
test('a local copy of the base scheme is not selected as nationwide representative',()=>{
  const local={title:'부모급여 지원',agency:'충청북도 보은군'};
  assert.equal(approvedNationalRepresentative(local),false);
  assert.equal(displayRegion(local,home,'mine'),false);
});

test('one seeded nationwide result survives and an independent local benefit remains',async()=>{
  const {scanPage}=await import('../src/lib/page-scan.ts');
  const {preferNationalRepresentatives}=await import('../src/lib/national-titles.ts');
  const official=verified.find(p=>p.title==='부모급여');
  const parent={...home,childrenCount:1,childBirthYears:'2026'};
  const db=[
    {id:'GOV24:central',title:'부모급여 지원',agency:'보건복지부'},
    {id:'GOV24:local-copy',title:'부모급여 지원',agency:'인천광역시 연수구청'},
    {id:'GOV24:local-extra',title:'인천 연수구 자체 출산지원',agency:'인천광역시 연수구청',region_sido:'인천',region_sigungu:'연수구'},
    {id:'GOV24:outside',title:'[제주] 출산 추가지원',agency:'제주특별자치도청'}
  ];
  const accept=preferNationalRepresentatives(p=>displayRegion(p,parent,'mine'));
  const result=await scanPage({
    start:{cursor:'',pending:[]},pageSize:50,maxRows:1000,
    initialItems:[official],accept,fetchBatch:async()=>({items:db,nextCursor:null})
  });
  assert.deepEqual(result.items.map(p=>p.id),[official.id,'GOV24:local-extra']);
});

test('exact-name independent local funding is kept without turning it into a national duplicate',()=>{
  const local={title:'부모급여 지원',agency:'인천광역시 연수구청',region_sido:'인천광역시',
    region_sigungu:'연수구',summary:'연수구 자체 예산으로 별도 지급'};
  assert.equal(approvedNationalRepresentative(local),false);
  assert.equal(displayRegion(local,home,'mine'),true);
  assert.equal(displayRegion({...local,summary:'전국 부모급여 신청 방법 안내'},home,'mine'),false);
});
