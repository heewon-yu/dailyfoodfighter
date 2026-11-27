#!/usr/bin/env node
/**
 * Read-only diagnostic of the REAL, local D1 snapshot.
 * The report contains candidates for manual review, not eligibility proof.
 *
 * node scripts/audit-local-filters.mjs audit-artifacts/baseline.json
 * node scripts/audit-local-filters.mjs audit-artifacts/baseline.json --json
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {classifyRegion,normalizeSido,regionFit} from '../src/lib/territory.ts';
import {displayRegion} from '../src/lib/region-visibility.ts';
import {matchProgram} from '../src/lib/matching.ts';
import {nationalTitles,nationalScheme} from '../src/lib/national-titles.ts';
import {matchesBrowseTopic} from '../src/lib/browse-topics.ts';
import {classifyIssuer} from '../src/lib/issuer-classification.ts';

const KST='2026-11-20T03:00:00.000Z';
const LIMIT_EXAMPLES=15;
const profiles=[
  {name:'인천광역시/시도만',profile:{regionSido:'인천광역시'}},
  {name:'인천 연수구/자녀 2025년생',profile:{regionSido:'인천광역시',regionSigungu:'연수구',childrenCount:1,childBirthYears:'2025',userType:'INDIVIDUAL'}},
  {name:'인천 연수구/무자녀',profile:{regionSido:'인천광역시',regionSigungu:'연수구',childrenCount:0,userType:'INDIVIDUAL'}},
  {name:'인천 연수구/소득 50%',profile:{regionSido:'인천광역시',regionSigungu:'연수구',incomeBracket:50,userType:'INDIVIDUAL'}},
  {name:'인천 연수구/소득 150%',profile:{regionSido:'인천광역시',regionSigungu:'연수구',incomeBracket:150,userType:'INDIVIDUAL'}}
];

function sample(items,limit=LIMIT_EXAMPLES) {
  return items.slice(0,limit).map(p=>({id:p.id,title:p.title,agency:p.agency,
    region_sido:p.region_sido,region_sigungu:p.region_sigungu}));
}
function isExplicitOther(p){
  const r=normalizeSido(p.region_sido);
  return Boolean(r&&r!=='인천광역시');
}
function isEligibleReview(p,asOfKstDate) {
  return !['ARCHIVED','CLOSED'].includes(p.status)&&
    (!p.end_date||p.end_date>=asOfKstDate);
}
/**
 * The source of truth is the separately captured snapshot itself. Structured
 * region conflicts are conservative review candidates, NEVER auto-corrections.
 */
export function inspectSnapshot(snapshot,now=new Date(KST)){
  assert.ok(snapshot&&Array.isArray(snapshot.programs),'snapshot.programs array required');
  const asOf=snapshot.asOfKstDate||new Date(now.getTime()+9*3600000).toISOString().slice(0,10);
  const active=snapshot.programs.filter(p=>isEligibleReview(p,asOf));
  const ids=active.map(p=>p.id);
  assert.equal(new Set(ids).size,ids.length,'duplicate source IDs');
  const scopes={NATIONAL:0,LOCAL:0,UNKNOWN:0};
  const unknown=[], contradictions=[],falseInclusions=[],falseExclusions=[];
  const issuerKinds={CENTRAL:0,PROVINCE:0,MUNICIPAL:0,OTHER:0,AMBIGUOUS:0};
  const unknownByIssuer={CENTRAL:0,PROVINCE:0,MUNICIPAL:0,OTHER:0,AMBIGUOUS:0};
  const unknownMunicipalSamples=[];
  for(const p of active){
    const geo=classifyRegion(p);
    scopes[geo.scope]++;
    const issuer=classifyIssuer(p.agency);
    issuerKinds[issuer.kind]++;
    if(geo.scope==='UNKNOWN'){
      unknown.push(p);
      unknownByIssuer[issuer.kind]++;
      if(issuer.kind==='MUNICIPAL'&&unknownMunicipalSamples.length<LIMIT_EXAMPLES)
        unknownMunicipalSamples.push({...sample([p],1)[0],issuerSido:issuer.sido,issuerSigungu:issuer.sigungu});
    }
    if(/서로 다름|지원 범위 확인 필요/.test(geo.evidence))contradictions.push({...p,evidence:geo.evidence});
    // Hard invariant: explicit, structured, other-province records must NEVER
    // be served under 'my region', regardless of title ambiguity.
    if(isExplicitOther(p)&&displayRegion(p,{regionSido:'인천광역시'},'mine'))
      falseInclusions.push(p);
    // Review only. A documented Incheon structured record should be visible
    // when district was not provided. Conflicts can legitimately stay unknown.
    if(normalizeSido(p.region_sido)==='인천광역시'&&
      !p.region_sigungu && !displayRegion(p,{regionSido:'인천광역시'},'mine'))
      falseExclusions.push(p);
  }
  const national=Object.fromEntries(nationalTitles.map(name=>{
    const candidates=active.filter(p=>{
      const compact=p.title.replace(/^\\d{4}년(?:도)?\s*/,'').replace(/\s+/g,'');
      return compact.startsWith(name);
    });
    const confirmed=candidates.filter(p=>classifyRegion(p).scope==='NATIONAL');
    return [name,{candidateCount:candidates.length,confirmedCount:confirmed.length,
      samples:sample(candidates,5),missingFromSnapshot:candidates.length===0}];
  }));
  const cohorts=profiles.map(({name,profile})=>{
    const mine=active.filter(p=>displayRegion(p,profile,'mine'));
    const birth=mine.filter(p=>matchesBrowseTopic(p,'birth','all'));
    const visible=mine.filter(p=>matchProgram(p,profile,now).status!=='NO');
    const exact=visible.filter(p=>matchProgram(p,profile,now).status==='LIKELY');
    return {name,regionVisible:mine.length,birthRelated:birth.length,
      profileVisible:visible.length,likelyCount:exact.length,
      manualReviewCount:visible.length-exact.length,
      visibleNational:visible.filter(p=>classifyRegion(p).scope==='NATIONAL').length,
      visibleExamples:sample(visible,5)};
  });
  const hardFailures=[
    ...(falseInclusions.length?[{kind:'explicit_other_region_leaked',count:falseInclusions.length,examples:sample(falseInclusions)}]:[]),
    ...(falseExclusions.length?[{kind:'explicit_incheon_region_hidden',count:falseExclusions.length,examples:sample(falseExclusions)}]:[])
  ];
  // A title prefix alone is not enough to label a local record a nationwide benefit.
  const mistakenNationals=active.filter(p=>isExplicitOther(p)&&
    nationalScheme(p.title,p.agency||'')&&classifyRegion(p).scope==='NATIONAL');
  if(mistakenNationals.length) hardFailures.push({kind:'structured_local_promoted_national',
    count:mistakenNationals.length,examples:sample(mistakenNationals)});
  return {
    capturedAt:snapshot.capturedAt,asOfKstDate:asOf,referenceRows:active.length,
    scopeCounts:scopes,national,issuerKinds,unknownByIssuer,unknownMunicipalSamples,
    unknownRegionCount:unknown.length,unknownRegionExamples:sample(unknown),
    contradictoryRegionCount:contradictions.length,
    contradictoryRegionExamples:contradictions.slice(0,LIMIT_EXAMPLES).map(p=>({
      ...sample([p],1)[0],evidence:p.evidence
    })),
    cohorts,hardFailures,
    hardChecksPassed:hardFailures.length===0,
    warning:'PASS is limited to explicit structured-region invariants. Manual review and official-source comparison required.'
  };
}
async function main() {
  const path=process.argv[2],json=process.argv.includes('--json');
  if(!path||path.startsWith('--'))throw new Error(
    'Usage: node scripts/audit-local-filters.mjs audit-artifacts/baseline.json [--json]');
  const s=JSON.parse(await readFile(path,'utf8'));
  const report=inspectSnapshot(s);
  if(json){console.log(JSON.stringify(report,null,2));}
  else {
    console.log('Snapshot:',report.capturedAt,'rows:',report.referenceRows);
    console.log('Regional scope:',JSON.stringify(report.scopeCounts));
    console.log('Issuer types:',JSON.stringify(report.issuerKinds));
    console.log('UNKNOWN by issuer:',JSON.stringify(report.unknownByIssuer));
    console.log('Unknown region:',report.unknownRegionCount,
      'contradictory evidence:',report.contradictoryRegionCount);
    for(const [title,row] of Object.entries(report.national))
      console.log('National',title,'candidate=',row.candidateCount,
        'confirmed=',row.confirmedCount,row.missingFromSnapshot?'NOT IN SNAPSHOT':'');
    for(const row of report.cohorts)
      console.log(row.name,'region=',row.regionVisible,'birth=',row.birthRelated,
        'personal=',row.profileVisible,'manual review=',row.manualReviewCount);
    console.log('Structured-region invariants:',report.hardChecksPassed?'PASS':'FAIL');
    for(const failure of report.hardFailures)console.log(JSON.stringify(failure));
    console.log('Inspect --json for samples of unclassified and contradictory records.');
  }
  if(!report.hardChecksPassed)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
