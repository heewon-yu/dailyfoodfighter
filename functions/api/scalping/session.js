import {ApiError, gameRequest, originFor, respond} from '../../_shared/scalping.js';
export async function onRequest({request,env}) {
  let origin;
  try {
    origin=originFor(request);
    if(request.method==='OPTIONS') return respond(null,200,origin);
    if(request.method!=='POST') throw new ApiError('method_not_allowed',405);
    return respond(await gameRequest(request,env),200,origin);
  } catch(error) {
    if(error instanceof ApiError) return respond({error:error.message},error.status,origin);
    console.error('Scalping session request failed',error.name);
    return respond({error:'database_unavailable'},503,origin);
  }
}
