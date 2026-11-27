import { normalizeSido, regionFit } from './territory.ts';
import { classifyIssuer } from './issuer-classification.ts';
import { allowNationalBaseRecord } from './national-titles.ts';
import type { RegionFit, RegionalEvidence } from './territory.ts';

export type RegionDisplayMode='mine'|'unknown'|'all';
export type RegionalProgram=RegionalEvidence;
export type RegionalProfile={regionSido?:string;regionSigungu?:string};

/** Compare fully qualified district names, including nested city/ward names. */
function sameJurisdiction(a:string,b:string):boolean {
  return a===b||a.startsWith(b+' ')||b.startsWith(a+' ');
}
/**
 * A known outside-local-government issuer is a default browse exclusion.
 * This is a user-selected discovery preference, NOT eligibility proof.
 * Central and ambiguous issuers cannot be treated as outside jurisdictions.
 */
export function issuerOutsideHome(program:RegionalProgram,profile:RegionalProfile):boolean {
  const home=normalizeSido(profile.regionSido);
  if(!home)return false;
  const issuer=classifyIssuer(program.agency);
  if(issuer.kind!=='PROVINCE'&&issuer.kind!=='MUNICIPAL')return false;
  if(issuer.sido!==home)return true;
  const district=profile.regionSigungu?.trim();
  return Boolean(district&&issuer.sigungu&&!sameJurisdiction(issuer.sigungu,district));
}

/**
 * Default browsing: include confirmed home-region, confirmed nationwide, and
 * unverified-region results. Exclude confirmed out-of-region notices and
 * notices administered by a clearly out-of-region local government.
 *
 * Confirmed nationwide or home-region coverage takes precedence over the
 * issuing office. Unknown scope can be reviewed separately.
 */
export function displayRegion(program:RegionalProgram,profile:RegionalProfile,
  mode:RegionDisplayMode):boolean {
  if(!allowNationalBaseRecord(program))return false;
  if(!normalizeSido(profile.regionSido))return true;
  const fit:RegionFit=regionFit(program,profile);
  if(mode==='all')return true;
  if(mode==='unknown')return fit==='UNKNOWN';
  if(fit==='OTHER')return false;
  if(fit==='NATIONAL'||fit==='MATCH')return true;
  return !issuerOutsideHome(program,profile);
}
