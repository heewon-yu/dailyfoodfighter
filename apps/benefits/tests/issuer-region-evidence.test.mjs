import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyRegion,regionFit} from '../src/lib/territory.ts';
import {displayRegion} from '../src/lib/region-visibility.ts';
const rec=(title,agency,extra={})=>({title,agency,...extra});
const incheon={regionSido:'인천광역시',regionSigungu:'연수구'};

test('영양군청 issued local birth credit is classified as 경북 영양군',()=>{
  const p=rec('출산축하금 지원','경상북도 영양군청');
  const info=classifyRegion(p);
  assert.equal(info.scope,'LOCAL');
  assert.equal(info.sido,'경상북도');
  assert.equal(info.sigungu,'영양군');
  assert.equal(regionFit(p,incheon),'OTHER');
  assert.equal(displayRegion(p,incheon,'mine'),false);
  assert.equal(regionFit(p,{regionSido:'경상북도',regionSigungu:'영양군'}),'MATCH');
});
test('unique municipality handles transfer benefit without structured region',()=>{
  const p=rec('전입지원금 신청','전라남도 곡성군');
  assert.equal(classifyRegion(p).sigungu,'곡성군');
  assert.equal(regionFit(p,incheon),'OTHER');
});
test('agency without applicant residency evidence must not restrict general benefits',()=>{
  for(const p of [
    rec('아동수당 안내','경상북도 영양군청'),
    rec('의료 지원사업','경상북도 영양군청'),
    rec('출산축하금 지원','보건복지부'),
    rec('전국 출산축하금 안내','영양군청'),
    rec('출산축하금 지원','서울특별시 중구청')
  ]){
    assert.notEqual(classifyRegion(p).scope,'LOCAL',p.title+' / '+p.agency);
  }
});
test('explicit beneficiary region beats county issuer local benefit hint',()=>{
  const p=rec('출산축하금 지원','경상북도 영양군청',{
    region_sido:'인천광역시',region_sigungu:'연수구'});
  assert.equal(classifyRegion(p).sido,'인천광역시');
});
