import assert from 'node:assert/strict';
import test from 'node:test';
import { matchProgram, relevanceScore } from '../src/lib/matching.ts';

const base = {
  id:'BIZINFO:P1', title:'자녀 돌봄 지원', category:'WELFARE',
  needs_review:1, min_age:20, max_age:35,
};

test('a child-related support program gains relevance for parent profile',()=>{
  const parent=relevanceScore(base,{childrenCount:2,childBirthYears:'2022,2025'});
  const noChildren=relevanceScore(base,{childrenCount:0});
  assert.ok(parent>noChildren);
});

test('pregnancy is a ranking hint, never eligibility proof',()=>{
  const program={...base,title:'임신 출산 지원'};
  assert.ok(relevanceScore(program,{expectingChild:true})>relevanceScore(program,{}));
  assert.equal(matchProgram(program,{expectingChild:true}).status,'CHECK');
});

test('unreviewed Gov24 age bounds cannot automatically disqualify household',()=>{
  const program={...base,source:'GOV24',min_age:18,max_age:65,needs_review:1};
  const result=matchProgram(program,{birthYear:1940},new Date('2026-11-19T02:00:00Z'));
  assert.notEqual(result.status,'NO');
});

test('reviewed explicit mismatched age may disqualify',()=>{
  const program={...base,needs_review:0};
  const result=matchProgram(program,{birthYear:1940},new Date('2026-11-19T02:00:00Z'));
  assert.equal(result.status,'NO');
});

test('confirmed expired application is not considered available',()=>{
  const program={...base,needs_review:0,end_date:'2026-11-18'};
  const result=matchProgram(program,{},new Date('2026-11-19T02:00:00Z'));
  assert.equal(result.status,'NO');
});

test('monthly renter ranks monthly-rent support above unrelated program',()=>{
  const profile={housingType:'MONTHLY_RENT'};
  assert.ok(relevanceScore({...base,title:'월세 지원'},profile)>relevanceScore({...base,title:'기업 수출 지원'},profile));
});

test('explicit 제주 title is excluded for an 인천 resident even when unreviewed',()=>{
  const p={...base,title:'[제주] 소상공인 지원',region_sido:null,needs_review:1};
  assert.equal(matchProgram(p,{regionSido:'인천광역시'}).status,'NO');
  assert.notEqual(matchProgram(p,{regionSido:'제주특별자치도'}).status,'NO');
});
test('explicit 경북 jurisdiction uses exact province and does not confuse 경기',()=>{
  const p={...base,title:'[경북] 수출 지원',needs_review:1};
  assert.equal(matchProgram(p,{regionSido:'경기도'}).status,'NO');
  assert.notEqual(matchProgram(p,{regionSido:'경상북도'}).status,'NO');
});
test('national program is not rejected by province',()=>{
  const p={...base,title:'전국 가족지원',region_sido:'전국'};
  assert.notEqual(matchProgram(p,{regionSido:'서울특별시'}).status,'NO');
});

test('confirmed childless profile excludes explicitly multi-child support',()=>{
  const p={...base,title:'다자녀 가구 지원'};
  assert.equal(matchProgram(p,{childrenCount:0}).status,'NO');
  assert.notEqual(matchProgram(p,{}).status,'NO');
});
test('housing mismatch excludes unambiguous monthly rent support only',()=>{
  const p={...base,title:'청년 월세 지원'};
  assert.equal(matchProgram(p,{housingType:'OWNER'}).status,'NO');
  assert.notEqual(matchProgram(p,{housingType:'MONTHLY_RENT'}).status,'NO');
});
test('single profile does not match explicitly married-couple program',()=>{
  assert.equal(matchProgram({...base,title:'신혼부부 지원'},{maritalStatus:'SINGLE'}).status,'NO');
});
test('marital or pregnancy unspecified profile remains reviewable',()=>{
  assert.notEqual(matchProgram({...base,title:'임산부 전용 지원'},{childrenCount:0}).status,'NO');
});

test('explicit local-scope wording without brackets excludes other provinces',()=>{
  const profile={regionSido:'인천광역시'};
  for(const title of ['제주특별자치도 주민 생활지원','경북 지역 소상공인 경영안정','(제주) 출산 지원']){
    assert.equal(matchProgram({...base,title},profile).status,'NO',title);
  }
});
test('place name only as a venue never implies applicant residency',()=>{
  const title='제주에서 개최하는 전국 청년 취업 설명회';
  assert.notEqual(matchProgram({...base,title},{regionSido:'인천광역시'}).status,'NO');
});
test('unverified govt household code does not override documented alternative group',()=>{
  const program={...base,condition_flags:{JA0411:'Y',JA0404:'Y'}};
  assert.notEqual(matchProgram(program,{childrenCount:0,householdSize:1}).status,'NO');
});
test('documented no-homeownership code filters owner',()=>{
  const program={...base,condition_flags:{JA0412:'Y'}};
  assert.equal(matchProgram(program,{housingType:'OWNER'}).status,'CHECK');
  assert.equal(matchProgram({...program,needs_review:0},{housingType:'OWNER'}).status,'NO');
});

test('explicit child allowance is excluded for confirmed childless profile',()=>{
  const p={...base,title:'아동수당 신청'};
  assert.equal(matchProgram(p,{childrenCount:0}).status,'NO');
  assert.notEqual(matchProgram(p,{childrenCount:1}).status,'NO');
});
test('business-only grants are excluded for private household profile',()=>{
  const p={...base,title:'[경북] 소상공인 경영안정 지원사업',region_sido:null};
  assert.equal(matchProgram(p,{regionSido:'경상북도',userType:'INDIVIDUAL',employmentStatus:'EMPLOYED'}).status,'NO');
});
test('one-person assistance is excluded for larger households',()=>{
  const p={...base,title:'1인가구 지원'};
  assert.equal(matchProgram(p,{householdSize:3}).status,'NO');
  assert.notEqual(matchProgram(p,{householdSize:1}).status,'NO');
});
test('confirmed Gov24 income bracket mismatch is excluded',()=>{
  const p={...base,title:'소득지원',condition_flags:{JA0201:'Y',JA0202:'Y'}};
  assert.equal(matchProgram(p,{incomeBracket:150}).status,'CHECK');
  assert.equal(matchProgram({...p,needs_review:0},{incomeBracket:150}).status,'NO');
  assert.notEqual(matchProgram(p,{incomeBracket:60}).status,'NO');
});

test('confirmed business applicant category excludes unrelated individual',()=>{
  const p={...base,category:'FUND',target_types:['SMALL_BIZ','SME']};
  assert.equal(matchProgram(p,{userType:'INDIVIDUAL'}).status,'CHECK');
  assert.equal(matchProgram({...p,needs_review:0},{userType:'INDIVIDUAL'}).status,'NO');
  assert.notEqual(matchProgram(p,{userType:'SMALL_BIZ'}).status,'NO');
});
test('official maternity flag excludes confirmed nonpregnant applicant only when no other option',()=>{
  const p={...base,condition_flags:{JA0302:'Y'}};
  assert.equal(matchProgram(p,{expectingChild:false}).status,'CHECK');
  assert.equal(matchProgram({...p,needs_review:0},{expectingChild:false}).status,'NO');
  assert.notEqual(matchProgram({...p,condition_flags:{JA0302:'Y',JA0303:'Y'}},{expectingChild:false,childrenCount:1}).status,'NO');
});
test('confirmed 1-person household does not fit larger household',()=>{
  assert.equal(matchProgram({...base,condition_flags:{JA0404:'Y'}},{householdSize:3}).status,'CHECK');
  assert.equal(matchProgram({...base,needs_review:0,condition_flags:{JA0404:'Y'}},{householdSize:3}).status,'NO');
});

const nov2026 = new Date('2026-11-20T02:00:00Z');
test('parent allowance rejects a fully specified older child; keeps newborn family',()=>{
  const p={...base,title:'부모급여 지원'};
  assert.equal(matchProgram(p,{childrenCount:1,childBirthYears:'2021'},nov2026).status,'NO');
  assert.notEqual(matchProgram(p,{childrenCount:1,childBirthYears:'2025'},nov2026).status,'NO');
});
test('parent allowance birth-year boundary is CHECK, not falsely excluded',()=>{
  const p={...base,title:'부모급여 지원'};
  const m=matchProgram(p,{childrenCount:1,childBirthYears:'2024'},nov2026);
  assert.equal(m.status,'CHECK');
  assert.ok(m.reasons.some(x=>x.includes('생월')));
});
test('a qualifying younger sibling prevents age exclusion',()=>{
  const p={...base,title:'부모급여 지급'};
  assert.notEqual(matchProgram(p,{childrenCount:2,childBirthYears:'2017,2026'},nov2026).status,'NO');
});
test('incomplete child birth-year entries are not proof of ineligibility',()=>{
  const p={...base,title:'부모급여 지급'};
  const m=matchProgram(p,{childrenCount:2,childBirthYears:'2018'},nov2026);
  assert.equal(m.status,'CHECK');
});
test('home childcare allowance uses 24-month lower bound conservatively',()=>{
  const p={...base,title:'가정양육수당 지원'};
  assert.equal(matchProgram(p,{childrenCount:1,childBirthYears:'2025'},nov2026).status,'NO');
  assert.equal(matchProgram(p,{childrenCount:1,childBirthYears:'2024'},nov2026).status,'CHECK');
  assert.notEqual(matchProgram(p,{childrenCount:1,childBirthYears:'2022'},nov2026).status,'NO');
});
test('daycare fee check handles older and 2020 preschool age cohorts',()=>{
  const p={...base,title:'영유아보육료 지원'};
  assert.equal(matchProgram(p,{childrenCount:1,childBirthYears:'2015'},nov2026).status,'NO');
  assert.notEqual(matchProgram(p,{childrenCount:1,childBirthYears:'2020'},nov2026).status,'NO');
  assert.equal(matchProgram(p,{childrenCount:0},nov2026).status,'NO');
});
test('kindergarten early-entry boundary remains reviewable',()=>{
  const p={...base,title:'유아학비 지원'};
  assert.notEqual(matchProgram(p,{childrenCount:1,childBirthYears:'2023'},nov2026).status,'NO');
});
test('generic or regional child program is never given invented national age limits',()=>{
  const p={...base,title:'[인천] 육아 돌봄 서비스'};
  assert.notEqual(matchProgram(p,{regionSido:'인천광역시',childrenCount:1,childBirthYears:'2015'},nov2026).status,'NO');
});
test('invalid and missing birth years cannot hard exclude',()=>{
  const p={...base,title:'부모급여 지원'};
  assert.equal(matchProgram(p,{childrenCount:1,childBirthYears:'202X'},nov2026).status,'CHECK');
  assert.equal(matchProgram(p,{childrenCount:1},nov2026).status,'CHECK');
});

test('deadline is evaluated in KST even before UTC midnight',()=>{
  const p={...base,end_date:'2026-11-19',needs_review:1};
  assert.equal(matchProgram(p,{},new Date('2026-11-19T16:00:00Z')).status,'NO');
  assert.notEqual(matchProgram(p,{},new Date('2026-11-19T13:59:00Z')).status,'NO');
});

test('province-specific allowance does not inherit national age exclusion',()=>{
  const p={...base,title:'[인천] 부모급여 지원'};
  assert.notEqual(matchProgram(p,{regionSido:'인천광역시',childrenCount:1,childBirthYears:'2021'},nov2026).status,'NO');
});
test('a nationwide or year-prefixed benefit may use the documented national range',()=>{
  const p={...base,title:'[전국] 2026년 부모급여 지원'};
  assert.equal(matchProgram(p,{childrenCount:1,childBirthYears:'2021'},nov2026).status,'NO');
});

test('official local jurisdiction prevents imported national child age cutoffs',()=>{
  const p={...base,title:'부모급여 지원',region_sido:'인천광역시'};
  assert.notEqual(matchProgram(p,{regionSido:'인천광역시',childrenCount:1,childBirthYears:'2021'},nov2026).status,'NO');
});


test('unverified Gov24 flags never prove ineligibility for age-neutral benefit',()=>{
  for(const data of [
    [{JA0411:'Y'},{childrenCount:1}],
    [{JA1102:'Y'},{userType:'PRE_STARTUP'}],
    [{JA0327:'Y'},{employmentStatus:'EMPLOYED'}],
  ]) {
    assert.equal(matchProgram({...base,title:'일반 생활지원',min_age:null,max_age:null,condition_flags:data[0]},
      data[1]).status,'CHECK');
  }
});
test('unknown locality must remain CHECK, not automatically eligible',()=>{
  const program={...base,title:'일반 지원',min_age:null,max_age:null,region_sido:null,agency:'알 수 없는 기관'};
  assert.equal(matchProgram(program,{regionSido:'인천광역시'}).status,'CHECK');
});
