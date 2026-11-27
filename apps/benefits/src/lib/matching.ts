import { classifyRegion, regionAreas, regionFit, normalizeSido } from './territory.ts';
import { childAgeDecision } from './child-age.ts';
export type UserType = 'PRE_STARTUP' | 'SMALL_BIZ' | 'INDIVIDUAL';
export type Profile = {
  userType?: UserType; birthYear?: number; regionSido?: string; regionSigungu?: string;
  businessStartDate?: string; annualRevenue?: number; householdSize?: number; incomeBracket?: number;
  childrenCount?: number; childBirthYears?: string; expectingChild?: boolean;
  housingType?: 'OWNER' | 'MONTHLY_RENT' | 'JEONSE' | 'OTHER';
  employmentStatus?: 'EMPLOYED' | 'JOB_SEEKER' | 'SELF_EMPLOYED' | 'STUDENT' | 'OTHER';
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'OTHER';
};
export type Program = {
  id: string; title: string; category: 'FUND' | 'WELFARE'; agency?: string | null;
  region_sido?: string | null; region_sigungu?: string | null;
  min_age?: number | null; max_age?: number | null; max_business_years?: number | null;
  income_limit_percent?: number | null; target_types?: string[];
  start_date?: string | null; end_date?: string | null; application_type?: string | null;
  needs_review?: number | boolean | null;
  condition_flags?: Record<string,string>;
};
export type Match = { status: 'LIKELY' | 'CHECK' | 'NO'; reasons: string[] };
function ageAtYear(birthYear: number, now: Date): number {
  // Year-only age is approximate: birth date is unknown.
  return new Date(now.getTime()+9*60*60*1000).getUTCFullYear() - birthYear;
}
export function matchProgram(p: Program, profile: Profile, now = new Date(), options: { compareAllRegions?: boolean } = {}): Match {
  const reasons: string[] = [];
  let uncertain = Boolean(p.needs_review);
  // Unreviewed machine-extracted fields are hints, not definitive reasons to
  // exclude a resident from a benefit. Only confirmed structured criteria can
  // return NO. Application dates remain independently verifiable.
  const strict = p.needs_review === false || p.needs_review === 0;
  const geo=classifyRegion(p);
  const fit=options.compareAllRegions?'UNSET':regionFit(p,profile);
  if(fit==='OTHER')
    return {status:'NO',reasons:['공고에 표시된 지원 지역과 거주 지역 불일치']};
  if(fit==='UNKNOWN' && normalizeSido(profile.regionSido)) {
    uncertain=true;
    reasons.push('지원 지역 미확인 · '+geo.evidence);
  }
  if(geo.scope==='LOCAL'&&!options.compareAllRegions) {
    if(!normalizeSido(profile.regionSido)){
      uncertain=true; reasons.push('지원 지역과 거주지 비교를 위해 시·도 입력 필요');
    } else {
      const home=normalizeSido(profile.regionSido);
      const selected=profile.regionSigungu?.trim();
      const area=regionAreas(geo).filter(x=>x.sido===home);
      const confirmed=area.some(x=>!x.sigungu || (selected &&
        (selected===x.sigungu||selected.startsWith(x.sigungu+' '))));
      if(!confirmed){
        uncertain=true; reasons.push('지원 대상 시·군·구 세부 범위 확인 필요');
      }
    }
  }
  if (p.min_age!=null || p.max_age!=null) {
    if (!profile.birthYear) { uncertain=true; reasons.push('연령 입력 필요'); }
    else {
      const age=ageAtYear(profile.birthYear,now);
      // Age by birth year alone can be one year off depending on birthday.
      if ((p.min_age!=null && age<p.min_age) || (p.max_age!=null && age-1>p.max_age))
        { if(strict)return {status:'NO',reasons:['연령 범위 불일치']}; uncertain=true; reasons.push('공고 원문에서 연령 조건 확인 필요'); }
      uncertain=true; reasons.push('생일·연령 산정 기준 추가 확인');
    }
  }
  if (p.max_business_years!=null) {
    if (!profile.businessStartDate) { uncertain=true; reasons.push('개업일 확인 필요'); }
    else {
      const opened=new Date(profile.businessStartDate+'T00:00:00Z');
      if (Number.isNaN(opened.getTime())) { uncertain=true; reasons.push('개업일 유효성 확인 필요'); }
      else {
        const years=(now.getTime()-opened.getTime())/(365.2425*86400000);
        if (years<0) return {status:'NO',reasons:['미래 개업일 확인 필요']};
        if (years>p.max_business_years) { if(strict)return {status:'NO',reasons:['업력 조건 불일치']}; uncertain=true; reasons.push('공고 원문에서 업력 조건 확인 필요'); }
      }
    }
  }
  if (p.income_limit_percent!=null) {
    if(profile.incomeBracket==null) { uncertain=true; reasons.push('중위소득 구간 확인 필요'); }
    else if(profile.incomeBracket>p.income_limit_percent) { if(strict)return {status:'NO',reasons:['입력된 중위소득 구간 초과']}; uncertain=true; reasons.push('공고 원문에서 소득 조건 확인 필요'); }
    else { uncertain=true; reasons.push('소득·가구원·기준연도 증빙 확인'); }
  }
  const today=new Date(now.getTime()+9*60*60*1000).toISOString().slice(0,10);
  if (p.end_date && /^\d{4}-\d{2}-\d{2}$/.test(p.end_date) && p.end_date<today)
    return {status:'NO',reasons:['공고 마감일 경과']};
  if(p.start_date && /^\d{4}-\d{2}-\d{2}$/.test(p.start_date) && p.start_date>today){
    uncertain=true; reasons.push('접수 예정 — 신청 시작일 확인');
  } else if(!p.end_date && p.application_type!=='ROLLING'){
    uncertain=true; reasons.push('접수기간 확인 필요');
  }
  // Strict mismatches are limited to unambiguous eligibility in the OFFICIAL
  // program title. A keyword in a summary may describe a benefit rather than
  // an applicant requirement, so uncertain conditions are never auto-rejected.
  const childAge = childAgeDecision(p.title, profile, now, geo.scope==='NATIONAL'?p.region_sido:'지역 확인 필요');
  if (childAge?.status === 'NO') return {status:'NO',reasons:[childAge.reason]};
  if (childAge) { uncertain=true; reasons.push(childAge.reason); }
  const t=p.title.replace(/\s+/g,'');
  const childCount=profile.childrenCount;
  if(childCount===0 && /다자녀(가구|지원|혜택)|영유아(가구|부모)|자녀가있는가구|아동수당|부모급여|양육수당/.test(t))
    return {status:'NO',reasons:['자녀 관련 필수 조건 불일치']};
  if(childCount!=null && childCount<2 && /다자녀(가구|지원|혜택)/.test(t))
    return {status:'NO',reasons:['다자녀 필수 조건 불일치']};
  if(profile.expectingChild===false && childCount===0 &&
     /임산부(전용|대상|지원)|임신부(전용|대상|지원)|난임부부(전용|지원)/.test(t))
    return {status:'NO',reasons:['임신·출산 관련 필수 조건 불일치']};
  if(profile.housingType && profile.housingType!=='MONTHLY_RENT' &&
     /월세(지원|보조|보전)|월임대료(지원|보조)/.test(t))
    return {status:'NO',reasons:['월세 거주 조건 불일치']};
  if(profile.housingType && profile.housingType!=='JEONSE' &&
     /전세보증금(지원|대출)|전세자금(대출|지원)/.test(t))
    return {status:'NO',reasons:['전세 거주 조건 불일치']};
  if(profile.userType==='INDIVIDUAL' && profile.employmentStatus!=='SELF_EMPLOYED' &&
     /^\s*(?:\[[^\]]+\]\s*)?(?:소상공인|중소기업|자영업자)(?:\s|·|지원|대상|전용|$)/.test(p.title))
    return {status:'NO',reasons:['사업자 대상 전용 공고']};
  if(profile.householdSize!=null && profile.householdSize!==1 &&
     /(?:1인가구|1인세대)(?:전용|대상|지원)/.test(t))
    return {status:'NO',reasons:['1인 가구 대상 조건 불일치']};
  if(profile.employmentStatus==='JOB_SEEKER' &&
     /재직자(전용|대상)|근로자(전용|대상)/.test(t))
    return {status:'NO',reasons:['재직자 대상 조건 불일치']};
  if(profile.employmentStatus==='EMPLOYED' && /구직자(전용|대상)|실업자(전용|대상)/.test(t))
    return {status:'NO',reasons:['구직·실업자 전용 지원']};
  if(profile.maritalStatus==='SINGLE' && /신혼부부(전용|대상|지원)/.test(t))
    return {status:'NO',reasons:['혼인 관련 명시적 조건 불일치']};

  // Official Gov24 condition flags identify who can apply. Within each
  // mutually related category, multiple Y flags are treated as alternatives.
  const flags=p.condition_flags||{};
  const yes=(key:string)=>flags[key]?.toUpperCase()==='Y';
  const incomes=[
    ['JA0201',0,50],['JA0202',50,75],['JA0203',75,100],
    ['JA0204',100,200],['JA0205',200,Infinity]
  ] as const;
  const allowedIncome=incomes.filter(([code])=>yes(code));
  if(allowedIncome.length) {
    if(profile.incomeBracket==null){
      uncertain=true;reasons.push('중위소득 비율 입력·산정기준 확인 필요');
    }else{
      const income=profile.incomeBracket;
      if(!allowedIncome.some(([,min,max])=>(income>min && income<=max) || (min===0&&income===0)))
        { if(strict)return {status:'NO',reasons:['정부24 공식 중위소득 구간 불일치']}; uncertain=true; reasons.push('정부24 공식 중위소득 구간 불일치 · 원문 조건 재확인'); }
      uncertain=true;reasons.push('소득 증빙·산정연도 확인 필요');
    }
  }
  if(yes('JA0411') && childCount!=null && childCount<2 &&
     !['JA0401','JA0402','JA0403','JA0404','JA0410','JA0413','JA0414'].some(yes))
    { if(strict)return {status:'NO',reasons:['다자녀 가구 조건 불일치']}; uncertain=true; reasons.push('다자녀 가구 조건 불일치 · 원문 조건 재확인'); }
  if(yes('JA0412') && profile.housingType==='OWNER')
    { if(strict)return {status:'NO',reasons:['무주택 세대 조건 불일치']}; uncertain=true; reasons.push('무주택 세대 조건 불일치 · 원문 조건 재확인'); }
  if(profile.userType==='PRE_STARTUP' && yes('JA1102') && !yes('JA1101'))
    { if(strict)return {status:'NO',reasons:['사업 운영 중인 신청자 대상']}; uncertain=true; reasons.push('사업 운영 중인 신청자 대상 · 원문 조건 재확인'); }
  if(profile.userType==='SMALL_BIZ' && yes('JA1101') && !yes('JA1102'))
    {uncertain=true;reasons.push('기존 사업자의 예비창업 해당 여부 확인');}
  if(profile.employmentStatus==='EMPLOYED' && yes('JA0327') && !yes('JA0326'))
    { if(strict)return {status:'NO',reasons:['구직자 대상 조건 불일치']}; uncertain=true; reasons.push('구직자 대상 조건 불일치 · 원문 조건 재확인'); }
  if(profile.employmentStatus==='JOB_SEEKER' && yes('JA0326') && !yes('JA0327'))
    { if(strict)return {status:'NO',reasons:['재직자 대상 조건 불일치']}; uncertain=true; reasons.push('재직자 대상 조건 불일치 · 원문 조건 재확인'); }
  const coveredGroups=p.target_types||[];
  if(profile.userType==='INDIVIDUAL' && coveredGroups.length>0 &&
     coveredGroups.every(x=>['SMALL_BIZ','PRE_STARTUP','SME'].includes(x))) {
    if(strict)return {status:'NO',reasons:['공식 지원대상은 사업자 또는 예비창업자']};
    uncertain=true;
    reasons.push('사업자·예비창업자 대상 여부 원문 확인 필요');
  }
  if(yes('JA0302') && profile.expectingChild===false &&
     !['JA0301','JA0303'].some(yes))
    { if(strict)return {status:'NO',reasons:['공식 임산부 대상 조건 불일치']}; uncertain=true; reasons.push('공식 임산부 대상 조건 불일치 · 원문 조건 재확인'); }
  if(yes('JA0303') && profile.expectingChild===false && childCount===0 &&
     !['JA0301','JA0302'].some(yes))
    { if(strict)return {status:'NO',reasons:['공식 출산·입양 조건 불일치']}; uncertain=true; reasons.push('공식 출산·입양 조건 불일치 · 원문 조건 재확인'); }
  if(yes('JA0404') && profile.householdSize!=null && profile.householdSize!==1 &&
     !['JA0401','JA0402','JA0403','JA0410','JA0411','JA0412','JA0413','JA0414'].some(yes))
    { if(strict)return {status:'NO',reasons:['공식 1인가구 대상 조건 불일치']}; uncertain=true; reasons.push('공식 1인가구 대상 조건 불일치 · 원문 조건 재확인'); }
  // Unknown target type, revenue or other unmodeled rules must never yield verified eligibility.
  if (p.target_types?.length) { uncertain=true; reasons.push('지원 대상 세부 조건 확인 필요'); }
  if (profile.annualRevenue!=null && p.category==='FUND') { uncertain=true; reasons.push('매출 및 신용 관련 개별 조건 확인'); }
  return {status:uncertain?'CHECK':'LIKELY',reasons:reasons.length?reasons:['입력 조건에 명시적 불일치 없음 — 최종 자격은 원문 확인']};
}

/** A transparent *ranking hint*, never an automatic eligibility decision. */
export function relevanceScore(p: Program & {summary?: string}, profile: Profile): number {
  const title = p.title || '';
  const summary = p.summary || '';
  const text = title + ' ' + summary.slice(0, 250);
  let score = 0;
  const geo=regionFit(p,profile);
  if(geo==='MATCH')score+=12;
  if(geo==='NATIONAL')score+=8;
  if(geo==='UNKNOWN' && normalizeSido(profile.regionSido))score-=4;
  if(geo==='OTHER')score-=30;
  if ((profile.childrenCount ?? 0) > 0 && /자녀|아동|양육|보육|육아|가족|다자녀|교육|돌봄/.test(text)) score += 5;
  if (profile.expectingChild && /임신|출산|산모|태아|신생아|산후/.test(text)) score += 6;
  if (profile.childBirthYears) {
    const years=profile.childBirthYears.split(',').map(v=>Number(v.trim())).filter(v=>Number.isInteger(v)&&v>=1900&&v<=new Date().getFullYear());
    if(years.some(y=>new Date().getFullYear()-y<=1)&&/영아|영유아|신생아|출산|부모급여/.test(text))score+=5;
    if(years.some(y=>new Date().getFullYear()-y>=7)&&/초등|학교|학생|교육|방과후/.test(text))score+=3;
  }
  if (profile.housingType==='MONTHLY_RENT' && /월세|임차|주거급여|월 임대료/.test(text)) score+=5;
  if (profile.housingType==='JEONSE' && /전세|보증금|주택자금/.test(text)) score+=5;
  if (profile.employmentStatus==='JOB_SEEKER' && /취업|구직|실업|훈련|일자리/.test(text)) score+=5;
  if (profile.employmentStatus==='SELF_EMPLOYED' && /사업|창업|소상공인|경영|기업/.test(text)) score+=4;
  if (profile.employmentStatus==='STUDENT' && /대학|장학|학자금|청년/.test(text)) score+=5;
  if (profile.maritalStatus==='MARRIED' && /신혼|부부|혼인/.test(text)) score+=3;
  return score;
}
