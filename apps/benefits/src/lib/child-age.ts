/**
 * Conservative birth-year-only matching for a few nationally documented
 * childcare benefits. This is NOT a general-purpose age inference engine.
 *
 * Eligibility depends on date of birth, facilities, schooling and other facts.
 * Return NO only when every explicitly listed child is outside the age range
 * even under the most favorable possible birthday, and the child list is complete.
 */
export type ChildAgeProfile = { childrenCount?: number; childBirthYears?: string };
export type ChildAgeDecision = { status: 'NO'|'CHECK'; reason: string };

type Range = { minMonths: number; maxMonthsExclusive: number; program: string };
function knownNationalChildBenefit(title: string): Range | null {
  // A province-labelled benefit may have different local eligibility.
  // Never transfer nationwide age limits to it just because the name matches.
  const leading = /^\s*[\[(（]([^\])）]{1,40})[\])）]/.exec(title)?.[1]?.trim();
  if (leading && !['전국','전체','공통'].includes(leading)) return null;
  const t = title.replace(/^\s*[\[(（][^\])）]{1,40}[\])）]\s*/, '').replace(/^\s*20\d{2}년\s*/, '').replace(/\s+/g,'');
  // Official basis (2026): parent allowance 0-23 months, home childcare
  // allowance 24-85 months (before school); 0-5 daycare and 3-5 preschool
  // use annual class cohorts, so wide month bounds below avoid false NOs.
  if (/^부모급여(?:지원|지급|신청|\(|$)/.test(t))
    return { minMonths: 0, maxMonthsExclusive: 24, program: '부모급여' };
  if (/^가정양육수당(?:지원|지급|신청|\(|$)/.test(t))
    return { minMonths: 24, maxMonthsExclusive: 86, program: '가정양육수당' };
  if (/^(?:영유아보육료|어린이집보육료)(?:지원|지급|신청|\(|$)/.test(t))
    return { minMonths: 0, maxMonthsExclusive: 84, program: '어린이집 보육료' };
  if (/^유아학비(?:지원|지급|신청|\(|$)/.test(t))
    return { minMonths: 24, maxMonthsExclusive: 84, program: '유아학비' };
  return null;
}
function completedMonths(year: number, month: number, day: number, now: Date): number {
  return (now.getUTCFullYear() - year) * 12 + now.getUTCMonth() + 1 - month
    - (now.getUTCDate() < day ? 1 : 0);
}
export function childAgeDecision(title: string, profile: ChildAgeProfile, now = new Date(), regionSido?: string | null): ChildAgeDecision | null {
  // A local eligibility jurisdiction may override national rules.
  if (regionSido && !['전국','전체','공통'].includes(regionSido)) return null;
  const rule = knownNationalChildBenefit(title);
  if (!rule) return null;
  if (profile.childrenCount === 0)
    return { status: 'NO', reason: rule.program + ' 대상 자녀 없음' };
  const raw = profile.childBirthYears?.trim();
  if (!raw) return { status: 'CHECK', reason: rule.program + ' 대상 자녀 출생연도 확인 필요' };
  const tokens = raw.split(/[,，、;\n]+/).map(v=>v.trim()).filter(Boolean);
  const localNow = new Date(now.getTime() + 9*60*60*1000);
  const nowYear = localNow.getUTCFullYear();
  const years = tokens.map(v=>Number(v));
  if (!years.length || years.some((y,i)=>!/^\d{4}$/.test(tokens[i]) || !Number.isInteger(y) || y<1900 || y>nowYear))
    return { status: 'CHECK', reason: '자녀 출생연도 입력 확인 필요' };
  const complete = profile.childrenCount != null && profile.childrenCount === years.length;
  let maybe = false;
  let definitely = false;
  let boundary = false;
  for(const year of years) {
    // Jan 1 is the oldest a child born in the given year can be.
    // Dec 31 is the youngest; future birthdays in this calendar year
    // are treated as 0 months for a conservative interval.
    const maxAge = completedMonths(year,1,1,localNow);
    const minAge = Math.max(0,completedMonths(year,12,31,localNow));
    const overlaps = maxAge >= rule.minMonths && minAge < rule.maxMonthsExclusive;
    if(!overlaps)continue;
    maybe = true;
    if(minAge >= rule.minMonths && maxAge < rule.maxMonthsExclusive) definitely = true;
    else boundary = true;
  }
  if(!maybe && complete)
    return { status: 'NO', reason: rule.program + '에 해당하는 연령대의 자녀 없음' };
  if(!maybe)
    return { status: 'CHECK', reason: '입력하지 않은 자녀의 출생연도 확인 필요' };
  if(boundary && !definitely)
    return { status: 'CHECK', reason: rule.program + ' 대상 여부는 정확한 생월·생일 확인 필요' };
  return { status: 'CHECK', reason: rule.program + ' 자녀 연령대 가능 — 시설 이용·세부 요건 확인 필요' };
}
