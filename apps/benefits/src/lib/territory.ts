import { nationalScheme } from './national-titles.ts';
import { classifyIssuer } from './issuer-classification.ts';
import { districtToProvince, provinceToDistricts } from './districts.ts';

/** Title and structured eligibility data only; an agency address is not residency evidence. */
const provinces:Record<string,string>={
  서울:'서울특별시',서울시:'서울특별시',서울특별시:'서울특별시',
  부산:'부산광역시',부산시:'부산광역시',부산광역시:'부산광역시',
  대구:'대구광역시',대구시:'대구광역시',대구광역시:'대구광역시',
  인천:'인천광역시',인천시:'인천광역시',인천광역시:'인천광역시',
  광주:'광주광역시',광주광역시:'광주광역시',
  대전:'대전광역시',대전시:'대전광역시',대전광역시:'대전광역시',
  울산:'울산광역시',울산시:'울산광역시',울산광역시:'울산광역시',
  세종:'세종특별자치시',세종시:'세종특별자치시',세종특별자치시:'세종특별자치시',
  경기:'경기도',경기도:'경기도',
  강원:'강원특별자치도',강원도:'강원특별자치도',강원특별자치도:'강원특별자치도',
  충북:'충청북도',충북도:'충청북도',충청북도:'충청북도',충남:'충청남도',충남도:'충청남도',충청남도:'충청남도',
  전북:'전북특별자치도',전북도:'전북특별자치도',전북특별자치도:'전북특별자치도',전라북도:'전북특별자치도',
  전남:'전라남도',전남도:'전라남도',전라남도:'전라남도',경북:'경상북도',경북도:'경상북도',경상북도:'경상북도',
  경남:'경상남도',경남도:'경상남도',경상남도:'경상남도',
  제주:'제주특별자치도',제주도:'제주특별자치도',제주특별자치도:'제주특별자치도'
};
const aliases=[...Object.keys(provinces)].sort((a,b)=>b.length-a.length);
const districts=Object.keys(districtToProvince).sort((a,b)=>b.length-a.length);
export type RegionScope='LOCAL'|'NATIONAL'|'UNKNOWN';
export type RegionArea={sido:string;sigungu:string|null};
export type RegionInfo={scope:RegionScope;sido:string|null;sigungu:string|null;areas?:RegionArea[];evidence:string};
export type RegionFit='MATCH'|'NATIONAL'|'UNKNOWN'|'OTHER'|'UNSET';
const UNKNOWN:RegionInfo={scope:'UNKNOWN',sido:null,sigungu:null,evidence:'원문에 확정적인 대상 지역 정보 없음'};

export function normalizeSido(raw:string|null|undefined):string|null {
  if(!raw)return null;
  const name=raw.replace(/\s+/g,'').trim();
  return Object.hasOwn(provinces,name)?provinces[name]:null;
}
export function selectableDistricts(sido:string|null|undefined):readonly string[] {
  const normalized=normalizeSido(sido);
  return normalized?(provinceToDistricts[normalized]||[]):[];
}
function nationwide(value:string):boolean {
  return /^(?:전국|전체|공통|전국민)$/.test(value.replace(/\s+/g,''));
}
/** Treat province-wide markers as province scope, not as a municipality. */
function normalizeSigungu(raw:string|null|undefined,sido:string):string|null {
  const value=(raw||'').trim();
  if(!value||/^(?:전국|전국민|공통|전체|전지역|관내전체|시도전체|모든시군구|해당없음)$/.test(value.replace(/\s+/g,'')))return null;
  const qualified=value.match(/^(\S+)[\s·,/]+(.+)$/);
  if(qualified&&normalizeSido(qualified[1])===sido)return qualified[2].trim();
  return value;
}
function localScope(areas:RegionArea[],evidence:string):RegionInfo {
  return {scope:'LOCAL',sido:areas[0].sido,sigungu:areas[0].sigungu,
    ...(areas.length>1?{areas}:{}),evidence};
}
const regionSeparator=/\s*(?:[,·/;+&]|\s+및\s+|\s+과\s+|\s+와\s+)\s*/;
function namedAreas(text:string):RegionArea[] {
  const parts=text.trim().split(regionSeparator);
  const result:RegionArea[]=[];
  for(const part of parts){
    const sido=normalizeSido(part);
    if(sido){result.push({sido,sigungu:null});continue;}
    const [parent,...district]=part.split(/\s+/);
    const province=normalizeSido(parent);
    const name=district.join(' ');
    if(province && selectableDistricts(province).includes(name)){
      result.push({sido:province,sigungu:name});continue;
    }
    if(Object.hasOwn(districtToProvince,part)){
      result.push({sido:districtToProvince[part],sigungu:part});continue;
    }
    return [];
  }
  return [...new Map(result.map(area=>[area.sido+'|'+area.sigungu,area])).values()];
}
function overlaps(a:string,b:string):boolean {
  return a===b||a.startsWith(b+' ')||b.startsWith(a+' ');
}
export function regionAreas(info:RegionInfo):RegionArea[] {
  return info.areas ?? (info.scope==='LOCAL'&&info.sido?[{sido:info.sido,sigungu:info.sigungu}]:[]);
}
function contradict(a:RegionInfo,b:RegionInfo):boolean {
  if(a.scope==='UNKNOWN'||b.scope==='UNKNOWN')return false;
  if(a.scope!==b.scope)return true;
  if(a.scope==='NATIONAL')return false;
  return !regionAreas(a).some(x=>regionAreas(b).some(y=>
    x.sido===y.sido&&(!x.sigungu||!y.sigungu||overlaps(x.sigungu,y.sigungu))));
}
function leadingDistrict(raw:string):{sido:string;sigungu:string}|null {
  for(const name of districts){
    if(!raw.startsWith(name))continue;
    const rest=raw.slice(name.length);
    if(/^에서\s*(?:개최|열리는|진행|모집)/.test(rest))return null;
    if(/^(?:\s|[·:：,\-]|대상|지원|보조|사업|주민|거주|소재|[이의을에]|$)/.test(rest)){
      return {sido:districtToProvince[name],sigungu:name};
    }
  }
  return null;
}
function titledScope(title:string):RegionInfo {
  // A name mentioned as a venue or an example does not restrict residence.
  let t=title.trim().replace(/^\d{4}년(?:도)?\s*/, '').replace(/^제\d+차\s*/, '');
  if(/^(?:전국(?:\s|민|대상|공통|사업|지원)|\[(?:전국|공통|전체)\]|\((?:전국|공통|전체)\))/.test(t))
    return {scope:'NATIONAL',sido:null,sigungu:null,evidence:'공고 제목의 전국 대상 표시'};
  const bracket=/^[\[(（]([^\])）]{1,45})[\])）]\s*/.exec(t);
  if(bracket){
    const value=bracket[1].trim();
    if(nationwide(value))return {scope:'NATIONAL',sido:null,sigungu:null,evidence:'공고 제목의 전국 표시'};
    const listed=namedAreas(value);
    if(listed.length)return localScope(listed,'공고 제목에 명시된 지원 지역');
    if(regionSeparator.test(value))return UNKNOWN;
    t=t.slice(bracket[0].length);
  }
  const prefix=t.match(/^(.+?)\s+(?:공동|지역|주민|거주자|소재|대상)/)?.[1];
  if(prefix&&regionSeparator.test(prefix)){
    const listed=namedAreas(prefix);
    return listed.length>1?localScope(listed,'공고 제목에 명시된 지원 지역'):UNKNOWN;
  }
  // A joined prefix without a clear target remains uncertain.
  if(regionSeparator.test(t.split(/\s+/)[0])){
    const listed=namedAreas(t.split(/\s+/)[0]);
    if(listed.length>1)return UNKNOWN;
  }
  for(const alias of aliases){
    if(!t.startsWith(alias))continue;
    const rest=t.slice(alias.length);
    if(!/^(?:\s|형|지역|주민|거주|시민|도민|민|관내|[·:：\-]|$)/.test(rest))continue;
    if(/^에서\s*(?:개최|열리는|진행|모집)/.test(rest))return UNKNOWN;
    const sido=provinces[alias];
    const next=leadingDistrict(rest.trimStart());
    return {scope:'LOCAL',sido,sigungu:next?.sido===sido?next.sigungu:null,
      evidence:'공고 제목의 시도명'};
  }
  const district=leadingDistrict(t);
  if(district)return {scope:'LOCAL',...district,evidence:'공고 제목의 시군구명'};
  return UNKNOWN;
}
/**
 * A local-government address alone is not an eligibility restriction.
 * Only use the issuing municipality together with a clearly locality-tied
 * program (e.g. a named county-issued local currency).
 */
function localIssuerEvidence(p:RegionalEvidence):RegionInfo|null {
  const agency=(p.agency||'').trim();
  const summary=(p.summary||'').trim();
  const title=p.title;
  const match=agency.match(/(?:^|\s)([가-힣]{2,8}(?:시|군|구))(?=\s|$)/g);
  if(!match||!/사랑카드|사랑상품권|지역화폐|지역사랑상품권/.test(summary+' '+title))return null;
  const districtsFound=[...new Set(match.map(x=>x.trim()).filter(x=>districtToProvince[x]))];
  if(districtsFound.length!==1)return null;
  const district=districtsFound[0];
  const namedPayment=new RegExp(district.slice(0,-1)+'\\s*(?:사랑카드|사랑상품권|지역화폐|지역사랑상품권)');
  if(!namedPayment.test(summary+' '+title))return null;
  return {scope:'LOCAL',sido:districtToProvince[district],sigungu:district,evidence:'지자체 발행 지역화폐와 소관기관의 일치'};
}
/**
 * A county/municipality can be used as jurisdiction evidence only when the
 * benefit is explicitly a local-government-specific payment. The issuer's
 * address alone is NEVER proof of applicant residency.
 */
function issuerLocalBenefitEvidence(p:RegionalEvidence):RegionInfo|null {
  const agency=(p.agency||'').trim();
  const title=p.title.trim();
  // Only a full, uniquely mapped locality name. Generic borough names such
  // as '중구' or '서구' are intentionally absent from districtToProvince.
  const matches=districts.filter(name=>{
    // Agency words can be separated by whitespace, punctuation or county
    // office suffixes; do not match within unrelated longer place names.
    const rx=new RegExp('(?:^|[\\s(（,·])'+name+
      '(?:청|청사|보건소|행정복지센터)?(?=$|[\\s)）,·])');
    return rx.test(agency);
  });
  // Parent cities and their wards may coexist in an agency. This conservative
  // method leaves that nested case unclassified pending explicit residence.
  if(matches.length!==1)return null;
  if(!/(?:출산축하금|출산장려금|전입지원금|전입축하금|출산축하용품|출산축하상품권|지역화폐|지역사랑상품권)/.test(title))
    return null;
  if(/(?:전국|전국민|타지역|타시도|관외)/.test(title))return null;
  const district=matches[0];
  return {scope:'LOCAL',sido:districtToProvince[district],sigungu:district,
    evidence:'기초지자체 소관기관 및 지자체 고유 급부명'};
}
export type RegionalEvidence={
  title:string;region_sido?:string|null;region_sigungu?:string|null;agency?:string|null;summary?:string|null
};
function residencyScope(summary:string):RegionInfo {
  // Only treat an explicit target field followed by a residence requirement
  // as evidence. Keep other mentions such as venues and contact addresses out.
  const qualified=summary.match(/(?:^|[\n○●])\s*(?:지원\s*대상|신청\s*대상)\s*[:：]\s*([^\n○●]{1,80}?)\s*(?:에\s*)?(?:거주(?:자|하는)|주민등록(?:을\s*둔|이\s*되어))/);
  if(!qualified)return UNKNOWN;
  const candidates=namedAreas(qualified[1].trim());
  return candidates.length?localScope(candidates,'지원 대상에 명시된 거주지 조건'):UNKNOWN;
}
/**
 * "관내 거주" is useful only when an applicant-residency clause explicitly
 * binds it to a single local-government issuer. An agency alone is not enough.
 */
function issuerResidencyEvidence(p:RegionalEvidence):RegionInfo {
  const summary=(p.summary||'').trim();
  const targeted=/(?:^|[\n○●])\s*(?:지원\s*대상|신청\s*대상|신청\s*자격)\s*[:：]\s*([^\n○●]{1,140})/.exec(summary);
  if(!targeted)return UNKNOWN;
  const applicant=targeted[1];
  if(!/(?:관내|해당\s*지역)\s*(?:주민등록|거주자|거주하는|주민)/.test(applicant))
    return UNKNOWN;
  if(/(?:전국|관외|타지역|타시도|타\s*시도)/.test(applicant))
    return UNKNOWN;
  const issuer=classifyIssuer(p.agency);
  if(issuer.kind!=='MUNICIPAL'&&issuer.kind!=='PROVINCE')return UNKNOWN;
  if(!issuer.sido)return UNKNOWN;
  return {scope:'LOCAL',sido:issuer.sido,sigungu:issuer.sigungu,
    evidence:'지원 대상의 관내 거주 요건과 고유 지자체 소관기관을 함께 확인'};
}
export function classifyRegion(p:RegionalEvidence):RegionInfo {
  const raw=p.region_sido?.trim()||'';
  const sub=p.region_sigungu?.trim()||'';
  const title=titledScope(p.title);
  const eligibility=residencyScope(p.summary||'');
  let structured:RegionInfo|undefined;
  if(nationwide(raw)){
    structured={scope:'NATIONAL',sido:null,sigungu:null,evidence:'공식 전국 지역 필드'};
  }else if(raw){
    const listed=namedAreas(raw);
    const province=normalizeSido(raw);
    if(province&&sub){
      const districts=sub.split(regionSeparator).map(part=>normalizeSigungu(part,province));
      if(districts.some(name=>name&&!selectableDistricts(province).includes(name))){
        return {...UNKNOWN,evidence:'공식 시·군·구 범위 확인 필요'};
      }
      structured=localScope(districts.map(sigungu=>({sido:province,sigungu})), '공식 지역 필드');
    }else if(listed.length&&(!sub||!normalizeSigungu(sub,listed[0].sido))){
      structured=localScope(listed,'공식 지역 필드');
    }else{
      return {...UNKNOWN,evidence:'공식 지역 필드의 지원 범위 확인 필요'};
    }
  }else if(sub){
    const listed=namedAreas(sub);
    if(listed.length)structured=localScope(listed,'공식 시·군·구 필드');
  }
  if(eligibility.scope!=='UNKNOWN'){
    if((structured&&contradict(eligibility,structured))||contradict(eligibility,title))
      return {...UNKNOWN,evidence:'지원 대상의 거주지 조건과 다른 지역 표기가 서로 다름'};
    return eligibility;
  }
  if(structured){
    if(contradict(structured,title))return {...UNKNOWN,evidence:'공식 지역 필드와 공고 제목이 서로 다름'};
    return structured;
  }
  // A scoped "관내 거주" clause is direct eligibility evidence only when the
  // issuing jurisdiction is unambiguous. Conflicts remain reviewable.
  const issuerResidency=issuerResidencyEvidence(p);
  if(issuerResidency.scope!=='UNKNOWN'){
    if(contradict(issuerResidency,title))
      return {...UNKNOWN,evidence:'지원 대상 관내 거주 조건과 제목의 지역 표기가 서로 다름'};
    if(title.scope==='UNKNOWN')return issuerResidency;
  }
  if(title.scope!=='UNKNOWN')return title;
  const local=localIssuerEvidence(p)??issuerLocalBenefitEvidence(p);
  if(local)return local;
  if(nationalScheme(p.title,p.agency?.trim()||''))
    return {scope:'NATIONAL',sido:null,sigungu:null,evidence:'전국 기본 제도명과 소관기관 확인'};
  return UNKNOWN;
}
export function officialTitleRegion(title:string):string|null{
  return titledScope(title).sido;
}
export function effectiveSido(p:RegionalEvidence):string|null{
  return classifyRegion(p).sido;
}
export function regionFit(
  p:RegionalEvidence,
  profile:{regionSido?:string;regionSigungu?:string}
):RegionFit {
  const home=normalizeSido(profile.regionSido);
  if(!home)return 'UNSET';
  const region=classifyRegion(p);
  if(region.scope==='UNKNOWN')return 'UNKNOWN';
  if(region.scope==='NATIONAL')return 'NATIONAL';
  const selected=profile.regionSigungu?.trim().replace(/\s+/g,' ');
  return regionAreas(region).some(area=>area.sido===home&&
    (!area.sigungu||!selected||overlaps(area.sigungu,selected)))?'MATCH':'OTHER';
}
export function regionMismatch(
  p:RegionalEvidence,
  profile:{regionSido?:string;regionSigungu?:string}
):boolean {
  return regionFit(p,profile)==='OTHER';
}
