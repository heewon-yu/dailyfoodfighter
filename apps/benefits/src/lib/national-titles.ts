// Names of base national schemes. Suffixes such as "추가 지원" are excluded.
export const nationalTitles = [
  '부모급여', '가정양육수당', '영유아보육료', '유아학비', '아동수당',
  '첫만남이용권', '아이돌봄서비스', '국민취업지원제도', '국민내일배움카드', '기초연금', '주거급여', '교육급여', '의료급여'
] as const;

export const nationalSuffixes = ['', '지원', '지급', '신청'] as const;
export const nationalAgency: Readonly<Record<string, RegExp>> = {
  첫만남이용권: /^보건복지부(?:\s|$)/,
  아이돌봄서비스: /^(?:성평등가족부|여성가족부)(?:\s|$)/,
  국민취업지원제도: /^고용노동부(?:\s|$)/,
  국민내일배움카드: /^고용노동부(?:\s|$)/,
  기초연금: /^보건복지부(?:\s|$)/
};

export function nationalScheme(title: string, agency: string): boolean {
  const compact = title.trim().replace(/^\d{4}년(?:도)?\s*/, '').replace(/\s+/g, '');
  const base = nationalTitles.find(name => nationalSuffixes.some(suffix => compact === name + suffix));
  if (!base) return false;
  // Local copies of a central scheme can have an identical title. Keep
  // unverified local copies out of nationwide results.
  return nationalAgency[base]?.test(agency) ?? (!agency || /^(?:교육부|보건복지부)(?:\s|$)/.test(agency));
}

/**
 * Central government or non-municipal explicitly nationwide official
 * announcements may represent the nationwide base scheme.
 * A local administration copy must never be used as a fallback.
 */
import { classifyIssuer } from './issuer-classification.ts';

export function nationalBaseKey(title:string):string|null {
  const compact=title.trim().replace(/^\d{4}년(?:도)?\s*/,'').replace(/\s+/g,'');
  return nationalTitles.find(name=>nationalSuffixes.some(suffix=>compact===name+suffix))||null;
}
export function approvedNationalRepresentative(p:{
  title:string;agency?:string|null;region_sido?:string|null;region_sigungu?:string|null;
}):boolean {
  if(!nationalBaseKey(p.title))return false;
  const declared=(p.region_sido||'').replace(/\s+/g,'');
  if(p.region_sigungu?.trim()|| (declared&&!/^(?:전국|전체|전국민|공통)$/.test(declared)))return false;
  const issuer=classifyIssuer(p.agency);
  if(issuer.kind==='CENTRAL')return true;
  return /^(?:전국|전체|전국민|공통)$/.test(declared) &&
    issuer.kind!=='PROVINCE'&&issuer.kind!=='MUNICIPAL'&&issuer.kind!=='AMBIGUOUS';
}
export function allowNationalBaseRecord(p:{
  title:string;agency?:string|null;region_sido?:string|null;region_sigungu?:string|null;summary?:string|null;
}):boolean {
  if(!nationalBaseKey(p.title)||approvedNationalRepresentative(p))return true;
  const issuer=classifyIssuer(p.agency);
  return Boolean((issuer.kind==='PROVINCE'||issuer.kind==='MUNICIPAL') && p.region_sido?.trim() &&
    !/^(?:전국|전체|전국민|공통)$/.test(p.region_sido.replace(/\s+/g,'')) &&
    /자체\s*예산|(?:시|군|구)비\s*(?:100%|전액)/.test(p.summary||''));
}


// scanPage evaluates seeded representatives before database rows. Reserve a
// scheme only when an eligible result is actually accepted for this page.
export function preferNationalRepresentatives<T extends Parameters<typeof approvedNationalRepresentative>[0]>(
  eligible:(program:T)=>boolean, previous:ReadonlySet<string>=new Set()
):(program:T)=>boolean {
  const seen=new Set(previous);
  return (program)=>{
    if(!eligible(program))return false;
    const key=nationalBaseKey(program.title);
    if(!key||!approvedNationalRepresentative(program))return true;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  };
}
