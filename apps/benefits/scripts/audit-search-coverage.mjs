// Run against a local programs snapshot. This tool makes no external requests.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { browseEligibility } from '../src/lib/browse-selection.ts';
import { facetTerms, topicTerms } from '../src/lib/browse-topics.ts';
import { approvedNationalRepresentative, nationalBaseKey, preferNationalRepresentatives } from '../src/lib/national-titles.ts';
import { scanPage } from '../src/lib/page-scan.ts';
import worker from '../worker/src/index.ts';

const path=process.argv[2];
if(!path)throw new Error('Usage: node scripts/audit-search-coverage.mjs /path/to/local-programs.sqlite');
const db=new DatabaseSync(path,{readOnly:true});
const catalog=JSON.parse(readFileSync(new URL('../src/lib/national-catalog.json',import.meta.url),'utf8'));
const home={regionSido:'인천광역시',regionSigungu:'연수구',incomeBracket:60,childrenCount:1,childBirthYears:'2025'};
const open={application_type:'ROLLING'};
const env={DB:{prepare(sql){return {bind(...args){return {
  async all(){return {results:db.prepare(sql).all(...args)};}
};}};}},INGEST_TOKEN:'unused'};
const contains=(value,term)=>String(value??'').replace(/[A-Z]/g,c=>c.toLowerCase()).includes(term);

try {
  const raw=db.prepare('SELECT * FROM programs ORDER BY created_at DESC, id DESC').all().map(p=>({
    ...p,target_types:JSON.parse(p.target_types),condition_flags:JSON.parse(p.eligibility_json).condition_flags,
  }));
  if(!raw.length)throw new Error('Empty audit snapshot');
  const defaults={topic:'all',subtopic:'all',availability:'review',profile:home,regionMode:'mine',personalFirst:true};
  const cases=[
    ['all-public',{profile:{},regionMode:'all',personalFirst:false}],
    ['incheon-default',{}], ['incheon-review',{regionMode:'unknown'}],
    ['incheon-compare',{regionMode:'all'}], ['jeju',{profile:{...home,regionSido:'제주',regionSigungu:undefined}}],
    ['open-only',{availability:'open'}], ['welfare',{category:'WELFARE'}],
    ['business-applicant',{category:'FUND',profile:{...home,userType:'PRE_STARTUP',businessStartDate:'2025-01-01',annualRevenue:5000}}],
    ['education-parent',{q:'보육료',agency:'교육부'}],
    ['parent-benefit',{q:'부모급여'}], ['summary-keyword',{q:'소득수준에 따라 차등지원',agency:'성평등가족부'}],
    ['no-result',{q:'__AUDIT_NOT_PRESENT_61B6__'}],
    ...Object.keys(topicTerms).map(topic=>['topic-'+topic,{topic}]),
    ...Object.keys(facetTerms).filter(f=>f!=='all').map(subtopic=>['facet-'+subtopic,{subtopic}]),
  ];
  const now=new Date();
  const today=new Date(now.getTime()+9*60*60*1000).toISOString().slice(0,10);
  let scenarios=0;
  let mismatches=0;
  for(const [name,overrides] of cases){
    const c={...defaults,...overrides};
    const eligible=p=>browseEligibility(p,c,now);
    const publicText=p=>(!c.category||p.category===c.category)&&
      (!c.agency||contains(p.agency,c.agency))&&
      (!c.q||[p.title,p.agency,p.summary].some(value=>contains(value,c.q.toLowerCase())));
    const seeds=catalog.filter(p=>p.verification_status==='VERIFIED'&&
      (c.availability==='review'||p.application_type===open.application_type)&&publicText(p)&&eligible(p));
    // The expected set comes from scanning the whole source in one pass, before applying pagination.
    const expected=new Set(), schemes=new Set();
    for(const p of [...seeds,...raw]){
      if(['CLOSED','ARCHIVED'].includes(p.status)||!eligible(p)||!publicText(p))continue;
      if(c.availability==='open'&&p.application_type!=='ROLLING'&&
         !(p.start_date&&p.end_date&&p.start_date<=today&&today<=p.end_date))continue;
      const key=approvedNationalRepresentative(p)?nationalBaseKey(p.title):null;
      if(key&&schemes.has(key))continue;
      if(key)schemes.add(key);
      expected.add(p.id);
    }

    const matched=new Set(), priorSchemes=new Set(), duplicates=[];
    let position={pending:[],cursor:''};
    let requests=0;
    let hasMore=true;
    let pages=0;
    do {
      if(++pages>raw.length+1)throw new Error(name+': pagination did not terminate');
      const result=await scanPage({start:position,pageSize:50,maxRows:1000,
        initialItems:pages===1?seeds:[],excludedIds:matched,
        accept:preferNationalRepresentatives(eligible,priorSchemes),
        async fetchBatch(cursor,limit){
          const url=new URL('https://local-audit.invalid/api/programs');
          for(const [key,value] of Object.entries({cursor,limit,availability:c.availability,
            category:c.category,q:c.q,agency:c.agency,topic:c.topic==='all'?undefined:c.topic,subtopic:c.subtopic})){
            if(value!==undefined)url.searchParams.set(key,value);
          }
          requests++;
          const response=await worker.fetch(new Request(url),env);
          if(!response.ok)throw new Error(name+': API '+response.status);
          return response.json();
        }
      });
      for(const p of result.items){
        const key=approvedNationalRepresentative(p)?nationalBaseKey(p.title):null;
        if(matched.has(p.id)||(key&&priorSchemes.has(key)))duplicates.push(p.id);
        matched.add(p.id);
        if(key)priorSchemes.add(key);
      }
      position=result.position;
      hasMore=result.hasMore;
    }while(hasMore);
    const missing=[...expected].filter(id=>!matched.has(id));
    const extra=[...matched].filter(id=>!expected.has(id));
    mismatches+=missing.length+extra.length+duplicates.length;
    scenarios++;
    console.log(JSON.stringify({name,expected:expected.size,found:matched.size,pages,requests,
      missing:missing.length,extra:extra.length,duplicates:duplicates.length,
      ...(missing.length?{missingSample:missing.slice(0,5)}:{}),
      ...(extra.length?{extraSample:extra.slice(0,5)}:{})}));
  }
  console.log(JSON.stringify({sourcePrograms:raw.length,scenarios,mismatches}));
  if(mismatches)process.exitCode=1;
}finally{db.close();}
