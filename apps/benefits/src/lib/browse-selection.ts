import { matchesBrowseTopic } from './browse-topics.ts';
import { matchProgram, type Profile, type Program } from './matching.ts';
import { displayRegion, type RegionDisplayMode } from './region-visibility.ts';

export type BrowseProgram = Program & {
  summary?: string | null;
  topic?: string;
  verification_status?: string;
};
export type BrowseSelection = {
  topic: string;
  subtopic: string;
  profile: Profile;
  regionMode: RegionDisplayMode;
  personalFirst: boolean;
};

export function matchesProgramTopic(program:BrowseProgram,topic:string,subtopic:string):boolean {
  if(program.topic && topic!=='all' && program.topic!==topic)return false;
  return matchesBrowseTopic(program,program.topic?'all':topic,subtopic);
}

export function browseEligibility(program:BrowseProgram,selection:BrowseSelection,now=new Date()):boolean {
  const today=new Date(now.getTime()+9*60*60*1000).toISOString().slice(0,10);
  return (!program.end_date || program.end_date>=today) &&
    matchesProgramTopic(program,selection.topic,selection.subtopic) &&
    displayRegion(program,selection.profile,selection.regionMode) &&
    (!selection.personalFirst || matchProgram(program,selection.profile,now,
      {compareAllRegions:selection.regionMode==='all'}).status!=='NO');
}
