import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectSnapshot} from '../scripts/audit-local-filters.mjs';

function fixture(programs){
  return {capturedAt:'2026-11-20T04:00:00Z',asOfKstDate:'2026-11-20',programs};
}
const p=(id,title,extra={})=>({
  id,title,category:'WELFARE',region_sido:null,region_sigungu:null,
  needs_review:1,application_type:'ROLLING',...extra
});
const date=new Date('2026-11-20T04:00:00Z');

test('Incheon scenario excludes explicit other-province and local currency',()=>{
  const data=fixture([
    p('1','인천광역시 아동 돌봄',{region_sido:'인천광역시'}),
    p('2','경상북도 지역지원',{region_sido:'경상북도'}),
    p('3','출산축하용품 구입비 지원',{agency:'전남광주통합특별시 영광군',
      summary:'영광사랑카드로 출산축하용품 30만원 지급'}),
    p('4','아동수당 지급',{agency:'보건복지부'}),
  ]);
  const report=inspectSnapshot(data,date);
  assert.equal(report.referenceRows,4);
  assert.equal(report.hardChecksPassed,true);
  assert.equal(report.scopeCounts.LOCAL,3);
  assert.equal(report.scopeCounts.NATIONAL,1);
  assert.equal(report.cohorts[0].regionVisible,2);
  assert.equal(report.national.아동수당.candidateCount,1);
  assert.equal(report.national.아동수당.confirmedCount,1);
});
test('conflicting title and home-region evidence stays visible for review, not silently omitted',()=>{
  const data=fixture([
    p('1','[경기] 복지혜택',{region_sido:'인천광역시'}),
  ]);
  const report=inspectSnapshot(data,date);
  // Under the new default search, an internally contradictory record is
  // UNKNOWN rather than a proven non-home-region match. Preserve visibility
  // as '지역 확인 필요' while still surfacing the discrepancy for manual review.
  assert.equal(report.scopeCounts.UNKNOWN,1);
  assert.equal(report.cohorts[0].regionVisible,1);
  assert.equal(report.hardChecksPassed,true);
  assert.deepEqual(report.hardFailures,[]);
  assert.equal(report.contradictoryRegionCount,1);
});
test('missing nationwide programs are reported as data gaps, not magically inserted',()=>{
  const report=inspectSnapshot(fixture([p('1','인천 주민 혜택',{region_sido:'인천'})]),date);
  assert.equal(report.national.부모급여.candidateCount,0);
  assert.equal(report.national.부모급여.missingFromSnapshot,true);
  assert.equal(report.hardChecksPassed,true);
});
test('rejects duplicate snapshot IDs and expired records are excluded',()=>{
  assert.throws(()=>inspectSnapshot(fixture([p('A','one'),p('A','two')]),date),/duplicate/);
  const report=inspectSnapshot(fixture([
    p('old','old',{end_date:'2026-11-19'}),
    p('new','new',{end_date:'2026-11-20'})
  ]),date);
  assert.equal(report.referenceRows,1);
});
