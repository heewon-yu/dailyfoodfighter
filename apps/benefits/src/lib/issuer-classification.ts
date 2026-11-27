/**
 * Classify an administrator, NOT the residency eligibility of an applicant.
 * An issuer's location alone must never restrict access to a benefit.
 */
import { districtToProvince, provinceToDistricts } from './districts.ts';

export type IssuerKind='CENTRAL'|'PROVINCE'|'MUNICIPAL'|'OTHER'|'AMBIGUOUS';
export type IssuerInfo={
  kind:IssuerKind;agency:string;sido:string|null;sigungu:string|null;
  evidence:string;canInferResidency:false
};
const central= /(?:^|[\s·(（])(?:보건복지부|고용노동부|교육부|행정안전부|국토교통부|기획재정부|중소벤처기업부|산업통상자원부|농림축산식품부|해양수산부|환경부|기후에너지환경부|과학기술정보통신부|여성가족부|성평등가족부|국가보훈부|법무부|문화체육관광부|외교부|통일부|국방부|식품의약품안전처|질병관리청|산림청|농촌진흥청|소방청|경찰청|국세청|관세청)(?=$|[\s·)）])/;
const provinceAliases:Readonly<Record<string,string>>={
  서울특별시:'서울특별시',서울시:'서울특별시',
  부산광역시:'부산광역시',부산시:'부산광역시',
  대구광역시:'대구광역시',대구시:'대구광역시',
  인천광역시:'인천광역시',인천시:'인천광역시',
  광주광역시:'광주광역시',
  대전광역시:'대전광역시',대전시:'대전광역시',
  울산광역시:'울산광역시',울산시:'울산광역시',
  세종특별자치시:'세종특별자치시',세종시:'세종특별자치시',
  경기도:'경기도',경기:'경기도',
  강원특별자치도:'강원특별자치도',강원도:'강원특별자치도',
  충청북도:'충청북도',충북:'충청북도',
  충청남도:'충청남도',충남:'충청남도',
  전북특별자치도:'전북특별자치도',전라북도:'전북특별자치도',전북:'전북특별자치도',
  전라남도:'전라남도',전남:'전라남도',
  경상북도:'경상북도',경북:'경상북도',
  경상남도:'경상남도',경남:'경상남도',
  제주특별자치도:'제주특별자치도',제주도:'제주특별자치도'
};
const names=Object.keys(provinceAliases).sort((a,b)=>b.length-a.length);
const districtNames=Object.keys(districtToProvince).sort((a,b)=>b.length-a.length);
function wordMatch(value:string,name:string,suffix=''){
  return new RegExp('(?:^|[\\s·,(/（])'+name+suffix+'(?=$|[\\s·,)）/])').test(value);
}
function provincesIn(agency:string){
  const found=new Set<string>();
  for(const alias of names)if(wordMatch(agency,alias,'(?:청|도청|시청|본청)?'))found.add(provinceAliases[alias]);
  return found;
}
function distinctDistricts(agency:string,provinceHint:string|null){
  const found=new Map<string,{sido:string;sigungu:string}>();
  for(const name of districtNames){
    if(!wordMatch(agency,name,'(?:청|보건소|주민센터|행정복지센터)?'))continue;
    const sido=districtToProvince[name];
    if(provinceHint && sido!==provinceHint)continue;
    found.set(sido+'|'+name,{sido,sigungu:name});
  }
  if(provinceHint){
    for(const name of provinceToDistricts[provinceHint]||[]){
      if(districtToProvince[name])continue;
      if(!wordMatch(agency,name,'(?:청|보건소|주민센터|행정복지센터)?'))continue;
      found.set(provinceHint+'|'+name,{sido:provinceHint,sigungu:name});
    }
  }
  return [...found.values()];
}
export function classifyIssuer(raw:string|null|undefined):IssuerInfo{
  const agency=(raw||'').replace(/\s+/g,' ').trim();
  const out=(kind:IssuerKind,sido:string|null=null,sigungu:string|null=null,evidence='')=>
    ({kind,agency,sido,sigungu,evidence,canInferResidency:false as const});
  if(!agency)return out('OTHER',null,null,'소관기관 미입력');
  if(central.test(agency))return out('CENTRAL',null,null,'중앙행정기관 명칭');
  const provinces=provincesIn(agency);
  if(provinces.size>1)return out('AMBIGUOUS',null,null,'복수 광역 지자체 명칭');
  const province=[...provinces][0]||null;
  const districts=distinctDistricts(agency,province);
  if(districts.length>1)return out('AMBIGUOUS',null,null,'복수 또는 중첩 기초 지자체 명칭');
  if(districts.length===1)return out('MUNICIPAL',districts[0].sido,
    districts[0].sigungu,'고유 기초지자체 명칭');
  if(province)return out('PROVINCE',province,null,'광역 지자체 명칭');
  const ambiguousWards=Object.values(provinceToDistricts).flat()
    .some(name=>!districtToProvince[name]&&wordMatch(agency,name,'(?:청)?'));
  if(ambiguousWards)return out('AMBIGUOUS',null,null,'소속 시도가 없는 중복 구명');
  return out('OTHER',null,null,'행정기관 유형/지역 확인 불가');
}
