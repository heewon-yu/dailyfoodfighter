import assert from 'node:assert/strict';
import test from 'node:test';
import {displayRegion,issuerOutsideHome} from '../src/lib/region-visibility.ts';
import {matchProgram} from '../src/lib/matching.ts';

const home={regionSido:'인천광역시',regionSigungu:'연수구'};
const p=(title,extra={})=>({title,id:'GOV24:sample',category:'WELFARE',needs_review:1,...extra});

test('default search includes national, local and unknown-region records together',()=>{
  assert.equal(displayRegion(p('[전국] 아동돌봄 지원'),home,'mine'),true);
  assert.equal(displayRegion(p('연수구 출산지원'),home,'mine'),true);
  assert.equal(displayRegion(p('공공 돌봄서비스'),home,'mine'),true);
  assert.equal(displayRegion(p('경상북도 주민 지원'),home,'mine'),false);
});
test('exclude outside municipal and province issuers even when program region is unknown',()=>{
  for(const agency of ['경상북도 영양군청','서울특별시청','경기도 광주시청']){
    const program=p('생활지원 정보',{agency});
    assert.equal(issuerOutsideHome(program,home),true,agency);
    assert.equal(displayRegion(program,home,'mine'),false,agency);
    assert.equal(displayRegion(program,home,'all'),true,agency);
  }
});
test('nationwide scope overrides an outside office; central ministries remain visible',()=>{
  const national=p('[전국] 의료 지원',{agency:'경상북도 영양군청'});
  assert.equal(displayRegion(national,home,'mine'),true);
  assert.equal(displayRegion(p('청년지원 정보',{agency:'보건복지부'}),home,'mine'),true);
});
test('same-local issuer and unknown or ambiguous issuer are not silently discarded',()=>{
  assert.equal(displayRegion(p('생활지원 정보',{agency:'인천광역시청'}),home,'mine'),true);
  assert.equal(displayRegion(p('생활지원 정보',{agency:'인천광역시 연수구청'}),home,'mine'),true);
  assert.equal(displayRegion(p('생활지원 정보',{agency:'중구청'}),home,'mine'),true);
  assert.equal(displayRegion(p('생활지원 정보',{agency:'시민재단'}),home,'mine'),true);
});
test('a different district within the same province is excluded if selected',()=>{
  assert.equal(displayRegion(p('생활 지원',{agency:'인천광역시 남동구청'}),home,'mine'),false);
  assert.equal(displayRegion(p('생활 지원',{agency:'인천광역시 남동구청'}),{regionSido:'인천광역시'},'mine'),true);
});
test('unknown region remains reviewable under personal matching and is not a false eligibility proof',()=>{
  const program=p('생활지원 정보',{agency:'시민재단'});
  assert.equal(displayRegion(program,home,'mine'),true);
  assert.equal(matchProgram(program,home).status,'CHECK');
});
test('no saved home province retains public browsing',()=>{
  assert.equal(displayRegion(p('서울특별시 주민 지원',{agency:'서울특별시청'}),{},'mine'),true);
});

test('explicit home eligibility takes precedence over the issuing institution address',()=>{
  const program=p('냉난방비 지원',{agency:'서울특별시청',region_sido:'인천광역시',region_sigungu:'연수구'});
  assert.equal(displayRegion(program,home,'mine'),true);
});
