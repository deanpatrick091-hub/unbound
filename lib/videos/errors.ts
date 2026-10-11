/** Provider objects can contain tokens and prompts. Return only reviewed public messages. */
export const VIDEO_QUOTA_MESSAGE='The video-generation service has reached its credit limit. The site owner must wait for renewed free credit or configure another authorised provider.';
export function videoFailure(error:unknown):{code:string;message:string;status?:number}{
 const value=typeof error==='object'&&error?error as {name?:string;httpResponse?:{status?:number};videoCode?:string}:{};
 const status=value.httpResponse?.status;
 if(value.videoCode==='storage')return {code:'storage',message:'The video could not be saved. Please try again later.'};
 if(status===402)return {code:'quota',status,message:VIDEO_QUOTA_MESSAGE};
 if(status===429)return {code:'rate_limit',status,message:'Too many video requests have been submitted. Please wait before trying again.'};
 if(status===401)return {code:'credentials',status,message:'The video service could not authenticate. The site owner must check the server configuration.'};
 if(status===403)return {code:'permission',status,message:'The connected account is not authorised to use this video model. The site owner must check its permissions.'};
 if(status===404||value.name==='InferenceClientRoutingError')return {code:'model',status,message:'This video model is unavailable through the connected provider.'};
 if(status===400||status===422||value.name==='InferenceClientInputError')return {code:'request',status,message:'The video service could not accept these settings. Try a different prompt or contact the site owner.'};
 if(value.name==='AbortError'||value.name==='TimeoutError')return {code:'timeout',message:'The video service did not finish within the hosting time limit. No video was saved.'};
 if(status&&status>=500)return {code:'outage',status,message:'The video service is temporarily unavailable. Please try again later.'};
 return {code:'unknown',status,message:'The video could not be completed. No finished video was saved. Please try again later.'};
}
/** Persisted credit failures are not retried until the operator acknowledges a real reset. */
export function videoQuotaBlocked(job:{error:string|null;created_at:string}|null,resetAt:string|undefined){
 if(job?.error!==VIDEO_QUOTA_MESSAGE)return false;
 const reset=Date.parse(resetAt??'');
 return !Number.isFinite(reset)||reset<=Date.parse(job.created_at)||reset>Date.now();
}
