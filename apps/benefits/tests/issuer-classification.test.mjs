import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyIssuer} from '../src/lib/issuer-classification.ts';
import {classifyRegion} from '../src/lib/territory.ts';
import {inspectSnapshot} from '../scripts/audit-local-filters.mjs';

test('classifies clear ministry and province without equating agency with residency',()=>{
  assert.equal(classifyIssuer('보건복지부').kind,'CENTRAL');
  assert.deepEqual([classifyIssuer('인천광역시청').kind,classifyIssuer('인천광역시청').sido],
    ['PROVINCE','인천광역시']);
  assert.equal(classifyRegion({title:'맞춤 복지서비스',agency:'인천광역시청'}).scope,'UNKNOWN');
});
test('classifies unique counties and avoids conflating Gwangju jurisdictions',()=>{
  assert.deepEqual([classifyIssuer('경상북도 영양군청').kind,classifyIssuer('경상북도 영양군청').sigungu],
    ['MUNICIPAL','영양군']);
  const city=classifyIssuer('경기도 광주시청');
  assert.equal(city.kind,'MUNICIPAL');
  assert.equal(city.sido,'경기도');
  assert.equal(city.sigungu,'광주시');
  assert.equal(classifyIssuer('서울특별시 중구청').kind,'MUNICIPAL');
  assert.equal(classifyIssuer('중구청').kind,'AMBIGUOUS');
});
test('does not force a region from an agency unrelated to eligibility',()=>{
  assert.equal(classifyIssuer('서울특별시 청년재단').kind,'PROVINCE');
  assert.equal(classifyRegion({title:'청년 프로그램 안내',agency:'서울특별시 청년재단'}).scope,'UNKNOWN');
  assert.equal(classifyIssuer('인천광역시청 및 경기도청').kind,'AMBIGUOUS');
});
test('snapshot report breaks down unknown scope by issuer without relabeling it',()=>{
  const snapshot={capturedAt:'2026-11-20T04:00:00Z',asOfKstDate:'2026-11-20',programs:[
    {id:'A',title:'맞춤 서비스',agency:'보건복지부',category:'WELFARE'},
    {id:'B',title:'복지 안내',agency:'경상북도 영양군청',category:'WELFARE'},
    {id:'C',title:'인천 복지 안내',agency:'인천광역시청',category:'WELFARE'},
    {id:'D',title:'일반 제도',agency:'사단법인 예시',category:'WELFARE'}
  ]};
  const report=inspectSnapshot(snapshot,new Date('2026-11-20T04:00:00Z'));
  assert.equal(report.issuerKinds.CENTRAL,1);
  assert.equal(report.issuerKinds.MUNICIPAL,1);
  assert.equal(report.issuerKinds.PROVINCE,1);
  assert.equal(report.issuerKinds.OTHER,1);
  assert.equal(report.unknownByIssuer.CENTRAL,1);
  assert.equal(report.unknownByIssuer.MUNICIPAL,1);
  assert.equal(report.unknownByIssuer.OTHER,1);
  assert.equal(report.unknownMunicipalSamples[0].issuerSigungu,'영양군');
  assert.equal(report.hardChecksPassed,true);
});
