import type { Profile } from './matching';
export const PROFILE_KEY = 'policy-benefit-profile-v1';
export const BOOKMARK_KEY = 'policy-benefit-bookmarks-v1';
export function loadProfile(): Profile {
  if (typeof localStorage==='undefined') return {};
  try {
    const parsed=JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    return parsed && typeof parsed==='object' && !Array.isArray(parsed) ? parsed as Profile : {};
  } catch { return {}; }
}
export function saveProfile(profile: Profile): void {
  if (typeof localStorage!=='undefined') localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));
}
export function deleteLocalPersonalization(): void {
  if(typeof localStorage!=='undefined') {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(BOOKMARK_KEY);
  }
}
