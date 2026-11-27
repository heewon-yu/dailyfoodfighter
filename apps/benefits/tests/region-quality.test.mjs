import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRegion, normalizeSido, regionFit, selectableDistricts } from '../src/lib/territory.ts';
import { displayRegion } from '../src/lib/region-visibility.ts';
import { matchProgram } from '../src/lib/matching.ts';

const atIncheon={regionSido:'인천광역시',regionSigungu:'연수구'};
const record=(title,extras={})=>({title,...extras});
test('standard and informal province names are normalized',()=>{
  assert.equal(normalizeSido('인천시'),'인천광역시');
  assert.equal(normalizeSido('인천'),'인천광역시');
  assert.equal(normalizeSido('전북'),'전북특별자치도');
  assert.equal(normalizeSido('전라북도'),'전북특별자치도');
  assert.equal(normalizeSido('서울특별시'),'서울특별시');
});
test('Gov24 titles beginning with full region names are not treated as nationwide',()=>{
  const p=record('경상북도 아이돌봄 본인부담금 지원');
  assert.deepEqual([classifyRegion(p).scope,classifyRegion(p).sido],['LOCAL','경상북도']);
  assert.equal(regionFit(p,atIncheon),'OTHER');
  assert.equal(matchProgram({...p,id:'GOV24:647',category:'WELFARE'},{regionSido:'인천광역시'}).status,'NO');
});
test('municipalities in official title are classified using unique districts',()=>{
  assert.equal(classifyRegion(record('곡성군 아이돌봄서비스 본인부담금 지원')).sido,'전라남도');
  assert.equal(classifyRegion(record('연수구 출산지원')).sido,'인천광역시');
  assert.equal(classifyRegion(record('제주시 청년지원')).sido,'제주특별자치도');
});
test('2026 Incheon administrative reorganization names are supported',()=>{
  for(const name of ['제물포구','영종구','검단구','서해구'])
    assert.equal(classifyRegion(record(name+' 생활지원')).sido,'인천광역시');
});
test('ambiguous district without parent province stays unverified',()=>{
  for(const t of ['중구 아동수당','서구 아이돌봄서비스','고성군 주민지원'])
    assert.equal(classifyRegion(record(t)).scope,'UNKNOWN',t);
});
test('bracketed province and Incheon-type public program are local',()=>{
  assert.equal(classifyRegion(record('[경북] 소상공인 지원')).sido,'경상북도');
  assert.equal(classifyRegion(record('인천형 가족 돌봄 지원')).sido,'인천광역시');
  assert.equal(classifyRegion(record('[대전] 지원금')).sido,'대전광역시');
});
test('a joint notice matches all named regions and excludes unlisted regions',()=>{
  for(const title of ['[인천/서울] 공동육아 지원','서울·인천 공동지원','서울 및 인천 주민 지원']){
    const p=record(title);
    assert.equal(regionFit(p,atIncheon),'MATCH');
    assert.equal(regionFit(p,{regionSido:'서울'}),'MATCH');
    assert.equal(regionFit(p,{regionSido:'경북'}),'OTHER');
  }
});
test('venue mentions are not mistaken for eligibility conditions',()=>{
  assert.equal(classifyRegion(record('제주에서 개최하는 전국 청년 취업 설명회')).scope,'UNKNOWN');
  assert.equal(classifyRegion(record('곡성군에서 개최하는 행사')).scope,'UNKNOWN');
});
test('nationwide and explicit source fields are honored',()=>{
  assert.equal(classifyRegion(record('[전국] 영유아보육료 지원')).scope,'NATIONAL');
  assert.equal(classifyRegion(record('전국 청년 지원')).scope,'NATIONAL');
  assert.equal(classifyRegion(record('일반 육아지원',{region_sido:'경기도'})).sido,'경기도');
  for(const p of [record('인천형 육아지원',{region_sido:'경기도'}),
    record('전남 지원',{region_sido:'전국'}),
    record('연수구 주민 지원',{region_sido:'인천광역시',region_sigungu:'남동구'})]){
    assert.match(classifyRegion(p).evidence,/서로 다름/);
    assert.equal(displayRegion(p,atIncheon,'unknown'),true);
  }
});
test('agency location never becomes an applicant residency restriction',()=>{
  assert.equal(classifyRegion(record('어르신 돌봄 안내',{agency:'경북도청'})).scope,'UNKNOWN');
});
test('county-issued birth credits are local even if source district is only in issuer and benefit text',()=>{
  const p=record('출산축하용품 구입비 지원',{
    agency:'전남광주통합특별시 영광군',
    summary:'출산축하용품 구입비 30만원 지원(영광사랑카드)'
  });
  assert.deepEqual([classifyRegion(p).scope,classifyRegion(p).sigungu],['LOCAL','영광군']);
  assert.equal(regionFit(p,atIncheon),'OTHER');
  assert.equal(regionFit(p,{regionSido:'전라남도',regionSigungu:'영광군'}),'MATCH');
});
test('ministry issuer alone does not establish nationwide eligibility',()=>{
  const ministry=record('지역별 맞춤 돌봄 지원',{agency:'보건복지부'});
  assert.equal(classifyRegion(ministry).scope,'UNKNOWN');
  assert.equal(regionFit(ministry,atIncheon),'UNKNOWN');
  const national=record('아동수당 지원',{agency:'보건복지부'});
  assert.equal(classifyRegion(national).scope,'NATIONAL');
});
test('unrelated agency address or local currency text alone cannot exclude a resident',()=>{
  assert.equal(classifyRegion(record('맞춤 돌봄 지원',{agency:'영광군'})).scope,'UNKNOWN');
  assert.equal(classifyRegion(record('특산물 안내',{agency:'영광군',summary:'서울사랑상품권 사업 안내'})).scope,'UNKNOWN');
});
test('default region search also shows unverified cases while excluding clear other regions',()=>{
  const mine=record('연수구 주민지원');
  const remote=record('곡성군 아이돌봄서비스 지원');
  const unknown=record('공공 돌봄서비스');
  const national=record('[전국] 보육료 지원');
  assert.equal(displayRegion(mine,atIncheon,'mine'),true);
  assert.equal(displayRegion(national,atIncheon,'mine'),true);
  assert.equal(displayRegion(remote,atIncheon,'mine'),false);
  assert.equal(displayRegion(unknown,atIncheon,'mine'),true);
  assert.equal(displayRegion(unknown,atIncheon,'unknown'),true);
  assert.equal(displayRegion(remote,atIncheon,'unknown'),false);
  assert.equal(displayRegion(remote,atIncheon,'all'),true);
});
test('if no home province is selected, public browsing remains available',()=>{
  assert.equal(displayRegion(record('인천형 복지지원'),{},'mine'),true);
  assert.equal(displayRegion(record('영유아복지 안내'),{},'unknown'),true);
});
test('structured sigungu mismatch is excluded within same province',()=>{
  const p=record('지원금',{region_sido:'인천광역시',region_sigungu:'남동구'});
  assert.equal(regionFit(p,atIncheon),'OTHER');
});
test('province-wide district markers do not exclude residents',()=>{
  for(const region_sigungu of ['전국','공통','전체','전 지역','관내 전체','시도 전체','모든 시군구','해당 없음']){
    const p=record('인천광역시 주민 혜택',{region_sido:'인천광역시',region_sigungu});
    assert.equal(classifyRegion(p).sigungu,null,region_sigungu);
    assert.equal(regionFit(p,atIncheon),'MATCH',region_sigungu);
  }
});
test('district labels qualified by their province are comparable to household district',()=>{
  const p=record('연수구 주민 혜택',{region_sido:'인천광역시',region_sigungu:'인천광역시 연수구'});
  assert.equal(regionFit(p,atIncheon),'MATCH');
  assert.equal(regionFit(p,{regionSido:'인천',regionSigungu:'남동구'}),'OTHER');
});
test('city-level applicant selection remains compatible with ward-level requirements',()=>{
  const p=record('수원시 영통구 가족지원',{region_sido:'경기도',region_sigungu:'경기도 수원시 영통구'});
  assert.equal(regionFit(p,{regionSido:'경기도',regionSigungu:'수원시'}),'MATCH');
  assert.equal(regionFit(p,{regionSido:'경기도',regionSigungu:'수원시 권선구'}),'OTHER');
});
test('partial household county data cannot prove a city mismatch',()=>{
  const p=record('인천광역시 양육지원',{region_sido:'인천광역시',region_sigungu:'연수구'});
  assert.equal(regionFit(p,{regionSido:'인천'}),'MATCH');
});
test('child age and income are independently checked even when a region matches',()=>{
  const p={id:'GOV24:parent',category:'WELFARE',title:'[전국] 부모급여 지원',needs_review:1,
    region_sido:'전국',condition_flags:{JA0201:'Y'}};
  assert.equal(matchProgram(p,{regionSido:'인천',childrenCount:1,childBirthYears:'2025',incomeBracket:30},
    new Date('2026-11-20T02:00:00Z')).status,'CHECK');
  // A young child and a matching income band remain reviewable, never
  // automatically approved for benefits.
});
test('income percentage interval has no false 0.5-point gap',()=>{
  const p={id:'GOV24:income',category:'WELFARE',title:'소득대상 가구 지원',needs_review:0,
    condition_flags:{JA0202:'Y'}};
  assert.notEqual(matchProgram(p,{incomeBracket:50.5}).status,'NO');
  assert.equal(matchProgram(p,{incomeBracket:49}).status,'NO');
  assert.equal(matchProgram(p,{incomeBracket:75.5}).status,'NO');
});

test('national base benefits remain visible even when D1 has no region fields',()=>{
  for(const title of ['부모급여 지원','가정양육수당 지원','영유아보육료 지원',
    '유아학비 지원','아동수당 지급']){
    assert.equal(classifyRegion(record(title)).scope,'NATIONAL',title);
    assert.equal(displayRegion(record(title,{agency:'보건복지부'}),atIncheon,'mine'),true,title);
  }
  assert.equal(classifyRegion(record('가정양육수당 추가 지원사업')).scope,'UNKNOWN');
  assert.equal(classifyRegion(record('[경북] 부모급여 지원')).sido,'경상북도');
});

test('uncertain region with valid home address does not cause automatic NO',()=>{
  const p={id:'GOV24:uncertain',title:'희망 키움 돌봄 서비스',category:'WELFARE',needs_review:1};
  const m=matchProgram(p,{regionSido:'인천광역시'});
  assert.equal(m.status,'CHECK');
  assert.ok(m.reasons.some(x=>x.includes('지역 미확인')));
});
test('future start date is not described as currently eligible',()=>{
  const p={id:'GOV24:future',title:'전국 창업 지원',category:'WELFARE',
    start_date:'2026-12-01',end_date:'2026-12-31',application_type:'DATED',needs_review:0};
  const m=matchProgram(p,{},new Date('2026-11-20T01:00:00Z'));
  assert.equal(m.status,'CHECK');
  assert.ok(m.reasons.some(x=>x.includes('접수 예정')));
});
test('missing official income percent produces a review reason instead of eligibility proof',()=>{
  const p={id:'GOV24:income',title:'중위소득 지원',category:'WELFARE',
    needs_review:0,condition_flags:{JA0203:'Y'}};
  const m=matchProgram(p,{});
  assert.equal(m.status,'CHECK');
  assert.ok(m.reasons.some(x=>x.includes('중위소득 비율 입력')));
});

test('complete province/district choices cover Busan and 2026 Incheon changes',()=>{
  assert.ok(selectableDistricts('부산광역시').includes('해운대구'));
  assert.ok(selectableDistricts('부산광역시').includes('강서구'));
  assert.ok(selectableDistricts('인천광역시').includes('영종구'));
  assert.ok(selectableDistricts('인천광역시').includes('서해구'));
  assert.ok(!selectableDistricts('인천광역시').includes('중구'));
  assert.equal(classifyRegion(record('해운대구 출산지원')).sido,'부산광역시');
  assert.equal(classifyRegion(record('강서구 출산지원')).scope,'UNKNOWN');
});
test('a selected parent city does not falsely exclude a ward-specific program',()=>{
  assert.ok(selectableDistricts('경기도').includes('수원시'));
  assert.ok(selectableDistricts('경기도').includes('수원시 영통구'));
  const p=record('수원시 영통구 가족지원');
  assert.equal(regionFit(p,{regionSido:'경기도',regionSigungu:'수원시'}),'MATCH');
  assert.equal(regionFit(p,{regionSido:'경기도',regionSigungu:'수원시 권선구'}),'OTHER');
});

test('confirmed central schemes appear in Incheon even without region fields',()=>{
  for (const [title, agency] of [
    ['첫만남이용권 지원','보건복지부'],
    ['아이돌봄 서비스','성평등가족부'],
    ['국민내일배움카드','고용노동부'],
    ['국민취업지원제도','고용노동부'],
    ['가정양육수당 지원','교육부'],
    ['아동수당','보건복지부']
  ]) assert.equal(displayRegion(record(title,{agency}),atIncheon,'mine'),true,title);
});

test('locally issued copies and extensions are not promoted to national schemes',()=>{
  assert.equal(displayRegion(record('첫만남이용권',{agency:'서울특별시 동대문구'}),atIncheon,'mine'),false);
  assert.equal(displayRegion(record('부모급여 지원',{agency:'충청북도 보은군'}),atIncheon,'mine'),false);
  assert.equal(classifyRegion(record('아이돌봄서비스 본인부담금 추가 지원',{agency:'성평등가족부'})).scope,'UNKNOWN');
});


test('multiple official districts match without broadening to the whole province',()=>{
  const p=record('주민 지원',{region_sido:'인천',region_sigungu:'연수구, 남동구'});
  assert.equal(regionFit(p,atIncheon),'MATCH');
  assert.equal(regionFit(p,{regionSido:'인천',regionSigungu:'남동구'}),'MATCH');
  assert.equal(regionFit(p,{regionSido:'인천',regionSigungu:'계양구'}),'OTHER');
  assert.equal(regionFit(record('주민 지원',{region_sido:'서울 / 인천'}),atIncheon),'MATCH');
});

test('explicit residency takes precedence over agency location and conflicting evidence stays reviewable',()=>{
  const p=record('주민 지원',{agency:'보건복지부',summary:'지원대상: 영광군에 거주하는 주민'});
  assert.equal(regionFit(p,atIncheon),'OTHER');
  assert.equal(regionFit({...p,region_sido:'인천'},atIncheon),'UNKNOWN');
  assert.equal(regionFit({...p,summary:'행사 장소: 영광군'},atIncheon),'UNKNOWN');
});

test('all-region comparison still enforces independently verified personal conditions',()=>{
  const p={id:'GOV24:combined',title:'[경북] 지원금',category:'WELFARE',needs_review:0,condition_flags:{JA0202:'Y'}};
  const compare={compareAllRegions:true};
  assert.equal(matchProgram(p,{...atIncheon,incomeBracket:60},undefined,compare).status,'CHECK');
  assert.equal(matchProgram(p,{...atIncheon,incomeBracket:20},undefined,compare).status,'NO');
  assert.equal(matchProgram(p,{...atIncheon,incomeBracket:60}).status,'NO');
});
