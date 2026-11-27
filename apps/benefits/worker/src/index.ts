import { topicTerms, facetTerms } from '../../src/lib/browse-topics.ts';
import { nationalTitles, nationalSuffixes } from '../../src/lib/national-titles.ts';

type Env = { DB: D1Database; INGEST_TOKEN: string };
type Program = {
  source: string; source_id: string; category: 'FUND' | 'WELFARE'; title: string;
  agency?: string | null; summary?: string | null; support_amount?: string | null;
  amount_type?: 'LOAN' | 'GRANT' | 'CASH' | 'SERVICE' | 'UNKNOWN';
  target_types?: string[]; region_sido?: string | null; region_sigungu?: string | null;
  min_age?: number | null; max_age?: number | null; max_business_years?: number | null;
  income_limit_percent?: number | null; start_date?: string | null; end_date?: string | null;
  application_type?: 'DATED' | 'ROLLING' | 'UNKNOWN'; apply_url: string;
  eligibility_json?: Record<string, unknown>; needs_review?: boolean;
  content_hash?: string | null; status?: string;
};
function kstToday(): string {
  return new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
}
async function purgeClosed(db: D1Database) {
  // Definitive dated expiry only; unknown-date notices are never deleted by inference.
  // Archived notices have passed the guarded complete-source reconciliation.
  const result=await db.prepare(
    "DELETE FROM programs WHERE status IN ('ARCHIVED','CLOSED') OR (end_date IS NOT NULL AND end_date < ?)"
  ).bind(kstToday()).run();
  return result.meta?.changes ?? 0;
}
const json = (value: unknown, status=200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
  'x-content-type-options': 'nosniff' }
});
function safeUrl(value: string) {
  try { const u = new URL(value); return u.protocol === 'https:' && Boolean(u.hostname); } catch { return false; }
}
function validate(p: any): p is Program {
  return p && typeof p.source === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(p.source) &&
    typeof p.source_id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(p.source_id) &&
    ['FUND','WELFARE'].includes(p.category) &&
    typeof p.title === 'string' && p.title.trim().length > 0 && p.title.length <= 500 &&
    typeof p.apply_url === 'string' && safeUrl(p.apply_url) &&
    (p.target_types === undefined || (Array.isArray(p.target_types) && p.target_types.every((x: unknown)=>typeof x === 'string'))) &&
    ['LOAN','GRANT','CASH','SERVICE','UNKNOWN',undefined].includes(p.amount_type) &&
    ['DATED','ROLLING','UNKNOWN',undefined].includes(p.application_type) &&
    [p.min_age,p.max_age,p.max_business_years,p.income_limit_percent].every(x=>x==null || (Number.isInteger(x) && x>=0)) &&
    [p.start_date,p.end_date].every(x=>x==null || /^\d{4}-\d{2}-\d{2}$/.test(x));
}
function auth(request: Request, env: Env) {
  const header = request.headers.get('authorization');
  // Secret must be set before ingest is enabled. Never log credentials.
  if (!env.INGEST_TOKEN || !header?.startsWith('Bearer ')) return false;
  const received = header.slice(7), expected = env.INGEST_TOKEN;
  if (received.length !== expected.length) return false;
  let diff=0; for (let i=0; i<received.length; i++) diff |= received.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
function n(v: string | number | null | undefined): string | number | null { return v ?? null; }
export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await purgeClosed(env.DB);
  },
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/health') {
      try { await env.DB.prepare('SELECT 1').first(); return json({status:'ok', storage:'connected'}); }
      catch { return json({status:'unavailable'},503); }
    }
    // Read-only authenticated backlog for official Gov24 detail enrichment.
    // No personal profiles or credentials are exposed to the public site.
    if (request.method === 'GET' && url.pathname === '/api/ingest/pending') {
      if (!auth(request,env)) return json({error:'unauthorized'},401);
      const limit=Math.max(1,Math.min(50,Math.floor(Number(url.searchParams.get('limit')||20)||20)));
      const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset')||0)||0)));
      try {
        const result=await env.DB.prepare(
          "SELECT source_id,title,agency,summary,apply_url,start_date,end_date,content_hash,"+
          "json_extract(eligibility_json,'$.last_source_modified') AS source_modified_at FROM programs "+
          "WHERE source='GOV24' AND status NOT IN ('ARCHIVED','CLOSED') "+
          "AND (end_date IS NULL OR end_date>=?) "+
          "AND COALESCE(json_extract(eligibility_json,'$.details_enriched'),0)<>1 "+
          "ORDER BY updated_at DESC, source_id LIMIT ? OFFSET ?"
        ).bind(kstToday(),limit,offset).all();
        return json({items:result.results||[],limit,offset});
      } catch { return json({error:'pending list unavailable'},503); }
    }
    if (request.method === 'POST' && url.pathname === '/api/ingest/check') {
      if (!auth(request, env)) return json({error:'unauthorized'},401);
      if ((Number(request.headers.get('content-length')) || 0) > 16000)
        return json({error:'payload too large'},413);
      let body: unknown;
      try {
        const raw=await request.text();
        if (new TextEncoder().encode(raw).byteLength > 16000) return json({error:'payload too large'},413);
        body=JSON.parse(raw);
      } catch { return json({error:'invalid json'},400); }
      if (!Array.isArray(body) || body.length > 100 || body.some(x=>
          !x || typeof x !== 'object' || typeof x.source!=='string' ||
          !/^[A-Za-z0-9_-]{1,100}$/.test(x.source) ||
          typeof x.source_id!=='string' || !/^[A-Za-z0-9_-]{1,200}$/.test(x.source_id) ||
          typeof x.content_hash!=='string' || !/^[a-f0-9]{64}$/.test(x.content_hash)))
        return json({error:'invalid check batch'},400);
      if (body.length===0) return json({changed:[]});
      try {
        const keys=(body as Array<{source:string;source_id:string;content_hash:string}>);
        const ids=keys.map(x=>x.source+':'+x.source_id);
        const found=await env.DB.prepare('SELECT id, content_hash, status FROM programs WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();
        const existing=new Map((found.results||[]).map((x:any)=>[String(x.id),x.status==='ARCHIVED'?'':String(x.content_hash||'')]));
        return json({changed:keys.filter(x=>existing.get(x.source+':'+x.source_id)!==x.content_hash).map(x=>({source:x.source,source_id:x.source_id}))});
      } catch { return json({error:'database unavailable'},503); }
    }
    if (request.method === 'GET' && url.pathname === '/api/programs') {
      const category=url.searchParams.get('category');
      if (category && !['FUND','WELFARE'].includes(category)) return json({error:'invalid category'},400);
      const region=(url.searchParams.get('region') || '').slice(0,80);
      const query=(url.searchParams.get('q') || '').slice(0,100);
      const topic=url.searchParams.get('topic') || '';
      if(topic && !Object.hasOwn(topicTerms,topic)) return json({error:'invalid topic'},400);
      const subtopic = url.searchParams.get('subtopic') || 'all';
      if (!Object.hasOwn(facetTerms,subtopic)) return json({error:'invalid subtopic'},400);
      const cursor=url.searchParams.get('cursor');
      const limit=Math.floor(Math.min(cursor===null?50:200, Math.max(1, Number(url.searchParams.get('limit') || 20) || 20)));
      // Offset is a paging position, not a cap on the searchable corpus.
      const requestedOffset=Number(url.searchParams.get('offset')||0);
      const offset=Number.isSafeInteger(requestedOffset)?Math.max(0,requestedOffset):0;
      const conditions=["status NOT IN ('ARCHIVED','CLOSED')"], params: (string | number)[]=[];
      // Only confirmed currently-open periods appear by default. Unknown
      // application windows are *not* proof that a service can be applied for.
      const availability=url.searchParams.get('availability') || 'open';
      if(!['open','review'].includes(availability)) return json({error:'invalid availability'},400);
      const today=kstToday();
      if(availability==='open'){
        conditions.push("(application_type='ROLLING' OR (start_date<=? AND end_date>=?))");
        params.push(today,today);
      } else {
        // Show unknown periods and upcoming openings for manual review.
        // The UI labels future start dates as "upcoming" and does not
        // advertise them as currently open. Known expired notices are excluded.
        conditions.push("(end_date IS NULL OR end_date>=?)");
        params.push(today);
      }
      if(category) { conditions.push('category=?');params.push(category); }
      const agency=(url.searchParams.get('agency')||'').trim().slice(0,40);
      if(agency){
        conditions.push("instr(lower(COALESCE(agency,'')),lower(?))>0");
        params.push(agency);
      }
      const collection=url.searchParams.get('collection');
      if(collection && collection!=='national') return json({error:'invalid collection'},400);
      if(collection==='national'){
        const names=nationalTitles.flatMap(title=>nationalSuffixes.map(suffix=>title+suffix));
        conditions.push("source='GOV24' AND REPLACE(title,' ','') IN ("+names.map(()=>'?').join(',')+")");
        params.push(...names);
      }
      if(region) { conditions.push("(region_sido IS NULL OR region_sido IN ('전국','전체',?))");params.push(region); }
      if(query){
        conditions.push("(instr(lower(title),lower(?))>0 OR instr(lower(COALESCE(agency,'')),lower(?))>0 OR instr(lower(COALESCE(summary,'')),lower(?))>0)");
        params.push(query,query,query);
      }
      // A newline prevents terms from matching across field boundaries.
      const addTerms=(terms:readonly string[])=>{
        conditions.push('('+terms.map(()=>"instr(title || char(10) || COALESCE(summary,''),?)>0").join(' OR ')+')');
        params.push(...terms);
      };
      if(subtopic!=='all')addTerms(facetTerms[subtopic]);
      if(topic==='business') conditions.push("category='FUND'");
      else if(topic) addTerms(topicTerms[topic]);
      if(cursor){
        const parts=/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})~([A-Za-z0-9_-]{1,100}:[A-Za-z0-9_-]{1,200})$/.exec(cursor);
        if(!parts)return json({error:'invalid cursor'},400);
        conditions.push('(created_at, id) < (?, ?)');
        params.push(parts[1],parts[2]);
      }
      // Shared public first pages are independent of the local user profile.
      // Search text and explicit regions bypass this shared cache.
      const edgeCache=ctx && typeof caches!=='undefined' && !query && !agency && !region && !cursor && offset===0
        ? (caches as CacheStorage & {default:Cache}).default : undefined;
      let cacheKey: Request | undefined;
      if(edgeCache){
        const key=new URL('/__benefits-cache/v2',url.origin);
        key.search=new URLSearchParams({
          today,availability,category:category||'',topic,subtopic,
          collection:collection||'',limit:String(limit),paging:cursor===null?'offset':'cursor'
        }).toString();
        cacheKey=new Request(key);
        const cached=await edgeCache.match(cacheKey).catch(()=>undefined);
        if(cached)return cached;
      }
      const order=cursor===null?'updated_at DESC, id ASC LIMIT ? OFFSET ?':'created_at DESC, id DESC LIMIT ?';
      const paging=cursor===null?[limit,offset]:[limit+1];
      const sql='SELECT id,source,category,title,agency,summary,support_amount,amount_type,target_types,region_sido,region_sigungu,min_age,max_age,max_business_years,income_limit_percent,start_date,end_date,application_type,apply_url,needs_review,last_verified_at,created_at,json_extract(eligibility_json,\'$.condition_flags\') AS flags_json FROM programs WHERE '+conditions.join(' AND ')+' ORDER BY '+order;
      try {
        const result=await env.DB.prepare(sql).bind(...params,...paging).all<{id:string;created_at:string}>();
        const rows=result.results||[];
        const last=rows[limit-1];
        const nextCursor=cursor!==null&&rows.length>limit&&last?last.created_at+'~'+last.id:null;
        const response=json({items:rows.slice(0,limit).map((p:any)=>{
          let condition_flags: Record<string,string> = {};
          try { const parsed=JSON.parse(p.flags_json||'{}');
            if(parsed && typeof parsed==='object' && !Array.isArray(parsed))
              condition_flags=parsed;
          }catch{/* Malformed source metadata must never crash public search. */}
          const {flags_json,created_at,...fields}=p;
          return {...fields,target_types:JSON.parse(p.target_types||'[]'),condition_flags};
        }),limit,offset,...(cursor!==null?{nextCursor}:{})});
        if(ctx&&edgeCache&&cacheKey){
          const shared=response.clone();
          shared.headers.set('Cache-Control','public, max-age=120');
          ctx.waitUntil(edgeCache.put(cacheKey,shared).catch(()=>{}));
        }
        return response;
      } catch { return json({error:'database unavailable'},503); }
    }
    if (request.method === 'POST' && url.pathname === '/api/ingest/purge') {
      if (!auth(request,env)) return json({error:'unauthorized'},401);
      try { return json({deleted:await purgeClosed(env.DB)}); }
      catch { return json({error:'database deletion failed'},503); }
    }
    if (request.method === 'POST' && url.pathname === '/api/ingest/archive') {
      if (!auth(request,env)) return json({error:'unauthorized'},401);
      if ((Number(request.headers.get('content-length')) || 0) > 5000)
        return json({error:'payload too large'},413);
      let payload: unknown;
      try {
        const body=await request.text();
        if(new TextEncoder().encode(body).byteLength>5000) return json({error:'payload too large'},413);
        payload=JSON.parse(body);
      }catch{return json({error:'invalid json'},400);}
      // Only guarded completed official catalog reconciliation may request deletion.
      if(!payload || typeof payload!=='object' ||
         !['GOV24','BIZINFO'].includes((payload as any).source) ||
         !Array.isArray((payload as any).ids) ||
         (payload as any).ids.length>25 ||
         (payload as any).ids.some((id:unknown)=>typeof id!=='string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)))
        return json({error:'invalid archive batch'},400);
      const source=(payload as {source:'GOV24'|'BIZINFO';ids:string[]}).source;
      const ids=(payload as {ids:string[]}).ids;
      if(!ids.length)return json({archived:0});
      try{
        const statement=env.DB.prepare("DELETE FROM programs WHERE source=? AND source_id=?");
        const result=await env.DB.batch(ids.map(id=>statement.bind(source,id)));
        return json({archived:result.reduce((n,item)=>n+(item.meta?.changes||0),0)});
      }catch{return json({error:'archive update failed'},503);}
    }
    if (request.method === 'POST' && url.pathname === '/api/ingest') {
      if (!auth(request,env)) return json({error:'unauthorized'},401);
      const maxBytes = 512000;
      const reader = request.body?.getReader();
      if (!reader) return json({error:'body required'},400);
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel();
            return json({error:'payload too large'},413);
          }
          chunks.push(value);
        }
      } catch { return json({error:'body read failed'},400); }
      const bytes = new Uint8Array(total);
      let cursor=0;
      for (const chunk of chunks) { bytes.set(chunk,cursor); cursor+=chunk.byteLength; }
      let payload: unknown;
      try { payload=JSON.parse(new TextDecoder().decode(bytes)); }
      catch { return json({error:'invalid json'},400); }
      if (!Array.isArray(payload) || payload.length===0 || payload.length>25 || !payload.every(validate)) return json({error:'invalid batch'},400);
      const now=kstToday();
      const statements=(payload as Program[]).map(p=> {
        if (p.status==='CLOSED' || (p.end_date && p.end_date < now)) {
          return env.DB.prepare("DELETE FROM programs WHERE id=?").bind(p.source+':'+p.source_id);
        }
        const id=p.source+':'+p.source_id;
        return env.DB.prepare(`INSERT INTO programs
        (id,source,source_id,category,title,agency,summary,support_amount,amount_type,target_types,region_sido,region_sigungu,min_age,max_age,max_business_years,income_limit_percent,start_date,end_date,application_type,apply_url,eligibility_json,needs_review,content_hash,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET category=excluded.category,title=excluded.title,agency=excluded.agency,summary=excluded.summary,support_amount=excluded.support_amount,amount_type=excluded.amount_type,target_types=excluded.target_types,region_sido=excluded.region_sido,region_sigungu=excluded.region_sigungu,min_age=CASE WHEN json_extract(excluded.eligibility_json,'$.conditions_enriched')=1 THEN excluded.min_age ELSE COALESCE(excluded.min_age,programs.min_age) END,max_age=CASE WHEN json_extract(excluded.eligibility_json,'$.conditions_enriched')=1 THEN excluded.max_age ELSE COALESCE(excluded.max_age,programs.max_age) END,max_business_years=excluded.max_business_years,income_limit_percent=excluded.income_limit_percent,start_date=CASE WHEN programs.source='GOV24' AND COALESCE(json_extract(programs.eligibility_json,'$.details_enriched'),0)=1 AND COALESCE(json_extract(excluded.eligibility_json,'$.details_enriched'),0)=0 THEN programs.start_date ELSE excluded.start_date END,end_date=CASE WHEN programs.source='GOV24' AND COALESCE(json_extract(programs.eligibility_json,'$.details_enriched'),0)=1 AND COALESCE(json_extract(excluded.eligibility_json,'$.details_enriched'),0)=0 THEN programs.end_date ELSE excluded.end_date END,application_type=CASE WHEN programs.source='GOV24' AND COALESCE(json_extract(programs.eligibility_json,'$.details_enriched'),0)=1 AND COALESCE(json_extract(excluded.eligibility_json,'$.details_enriched'),0)=0 THEN programs.application_type ELSE excluded.application_type END,apply_url=excluded.apply_url,eligibility_json=CASE WHEN programs.source='GOV24' AND (json_extract(programs.eligibility_json,'$.details_enriched')=1 OR json_extract(programs.eligibility_json,'$.conditions_enriched')=1) AND COALESCE(json_extract(excluded.eligibility_json,'$.details_enriched'),0)=0 AND COALESCE(json_extract(excluded.eligibility_json,'$.conditions_enriched'),0)=0 THEN programs.eligibility_json ELSE excluded.eligibility_json END,needs_review=excluded.needs_review,content_hash=excluded.content_hash,status=excluded.status,updated_at=CURRENT_TIMESTAMP,last_verified_at=CURRENT_TIMESTAMP`)
          .bind(id,p.source,p.source_id,p.category,p.title,n(p.agency),n(p.summary),n(p.support_amount),p.amount_type||'UNKNOWN',JSON.stringify(p.target_types||[]),n(p.region_sido),n(p.region_sigungu),n(p.min_age),n(p.max_age),n(p.max_business_years),n(p.income_limit_percent),n(p.start_date),n(p.end_date),p.application_type||'UNKNOWN',p.apply_url,JSON.stringify(p.eligibility_json||{}),p.needs_review===false?0:1,n(p.content_hash),p.status||'UNKNOWN');
      });
      try { await env.DB.batch(statements); return json({imported:statements.length}); }
      catch { return json({error:'database write failed'},503); }
    }
    return json({error:'not found'},404);
  }
} satisfies ExportedHandler<Env>;
