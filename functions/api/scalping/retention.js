import {ApiError,dayAt,dbFor,hashToken,respond} from '../../_shared/scalping.js';

export async function onRequestPost({request,env}) {
  try {
    const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if(!token || !env.SCALPING_D1_MAINTENANCE_DIGEST) throw new ApiError('unauthorized',401);
    const hash=await hashToken(token);
    const diff=[...hash].reduce((sum,value,index)=>sum|(value.charCodeAt(0)^env.SCALPING_D1_MAINTENANCE_DIGEST.charCodeAt(index)),0);
    if(diff || env.SCALPING_D1_MAINTENANCE_DIGEST.length!==64) throw new ApiError('unauthorized',401);
    const db=dbFor(env),now=Date.now(),cutoff=dayAt(now-86400000);
    const statuses=await db.batch([
      // Legacy pre-v5 client-submitted rankings must not remain indefinitely.
      db.prepare("DELETE FROM daily_rankings WHERE kst_day<?").bind(cutoff),
      db.prepare("DELETE FROM rounds WHERE max(day,coalesce(end_day,day))<? AND (status<>'active' OR started_ms<?)").bind(cutoff,now-86400000),
      db.prepare('DELETE FROM quotas WHERE day<?').bind(cutoff),
      db.prepare('DELETE FROM ad_intents WHERE day<? AND created_ms<?').bind(cutoff,now-86400000),
      db.prepare('DELETE FROM ad_receipts WHERE received_ms<?').bind(now-604800000),
      db.prepare('DELETE FROM security_events WHERE day<?').bind(dayAt(now-604800000)),
    ]);
    return respond({ok:true,day:dayAt(now),deleted:statuses.map(item=>item.meta.changes)});
  }catch(error){
    return respond({error:error instanceof ApiError?error.message:'maintenance_unavailable'},error instanceof ApiError?error.status:503);
  }
}
