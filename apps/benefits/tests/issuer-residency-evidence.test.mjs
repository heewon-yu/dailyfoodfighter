import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyRegion,regionFit} from '../src/lib/territory.ts';

const resident=(agency,summary,title='생활비 지원')=>({title,agency,summary});
test('local issuer and explicit applicant residence scope narrow eligibility',()=>{
  const p=resident('경상북도 영양군청','지원대상: 관내 주민등록을 둔 주민');
  assert.deepEqual([classifyRegion(p).scope,classifyRegion(p).sido,classifyRegion(p).sigungu],
    ['LOCAL','경상북도','영양군']);
  assert.equal(regionFit(p,{regionSido:'인천광역시'}),'OTHER');
  assert.equal(regionFit(p,{regionSido:'경상북도',regionSigungu:'영양군'}),'MATCH');
});
test('explicit city/province applicant scope applies without guessing a district',()=>{
  const p=resident('인천광역시청','신청 대상: 관내 거주자');
  assert.equal(classifyRegion(p).sido,'인천광역시');
  assert.equal(classifyRegion(p).sigungu,null);
});
test('issuer without residency clause, central office, or ambiguous ward remains unverified',()=>{
  for(const p of [
    resident('영양군청','관내 거주자를 위한 행사 안내'),
    resident('보건복지부','지원대상: 관내 거주자'),
    resident('중구청','신청 대상: 관내 거주자'),
    resident('영양군청','지원대상: 전국 거주자')
  ])assert.equal(classifyRegion(p).scope,'UNKNOWN',p.agency+'/'+p.summary);
});
test('conflicting applicant-residency and nationwide title remains reviewable',()=>{
  const p=resident('영양군청','지원대상: 관내 주민등록 거주자','[전국] 주민 생활 지원');
  assert.equal(classifyRegion(p).scope,'UNKNOWN');
});
