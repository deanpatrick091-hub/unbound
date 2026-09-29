import 'server-only';
import {INTEGRATIONS} from '@/lib/integrations/catalog';
export type ProviderStatus='AVAILABLE'|'RATE LIMITED'|'CONFIGURATION REQUIRED'|'TEMPORARILY UNAVAILABLE'|'FAILED';
const health=new Map<string,{status:ProviderStatus;checkedAt:string;until:number}>();
export class IntegrationError extends Error {
 constructor(public status:number,message:string,public retryAfter?:number){super(message);}
}
export function integrationConfig(id:string){
 const spec=INTEGRATIONS.find(p=>p.id===id);if(!spec)throw new IntegrationError(400,'Choose a supported integration.');
 const value=spec.env?process.env[spec.env]?.trim():undefined;
 const key=value&&value.length>=8&&!/\s/.test(value)?value:undefined;
 const confirmed=process.env[id.toUpperCase()+'_FREE_TIER_CONFIRMED']==='true';
 const configured=!spec.env||!!spec.optionalKey||!!key&&confirmed;
 // An optional key is never used against a possibly paid account without confirmation.
 return {spec,key:confirmed?key:undefined,configured};
}
export function integrationStatuses(){return INTEGRATIONS.map(spec=>{
 const c=integrationConfig(spec.id);const h=health.get(spec.id);const current=h&&h.until>Date.now()?h:undefined;
 return {...spec,status:!c.configured?'CONFIGURATION REQUIRED':current?.status??'AVAILABLE',checkedAt:h?.checkedAt??null,liveTest:h?'Request observed':'Not live-tested in this server instance'};
});}
export function markIntegration(id:string,status:ProviderStatus){health.set(id,{status,checkedAt:new Date().toISOString(),until:Date.now()+(status==='AVAILABLE'?600000:60000)});}
export async function providerFetch(id:string,url:string,init:RequestInit={},signal?:AbortSignal):Promise<Response>{
 const config=integrationConfig(id);if(!config.configured)throw new IntegrationError(503,`${config.spec.name} needs its legitimate server key and verified free account configuration.`);
 const previous=health.get(id);if(previous?.status==='RATE LIMITED'&&previous.until>Date.now())throw new IntegrationError(429,`${config.spec.name} is rate limited. Please retry shortly.`,Math.ceil((previous.until-Date.now())/1000));
 let response:Response;
 try{response=await fetch(url,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(40000),...(signal?[signal]:[])])});}
 catch{markIntegration(id,'TEMPORARILY UNAVAILABLE');throw new IntegrationError(502,`${config.spec.name} could not be reached. Please retry.`);}
 if(!response.ok){
  const limited=response.status===429||response.status===402;
  const retry=Math.min(3600,Math.max(5,Number(response.headers.get('retry-after'))||60));
  markIntegration(id,limited?'RATE LIMITED':response.status===401||response.status===403?'FAILED':'TEMPORARILY UNAVAILABLE');
  if(limited)health.get(id)!.until=Date.now()+retry*1000;
  throw new IntegrationError(limited?429:502,limited?`${config.spec.name}'s free allowance is busy or exhausted. Try again after its reset.`:`${config.spec.name} could not complete the request (HTTP ${response.status}).`,limited?retry:undefined);
 }
 return response;
}
export async function boundedText(response:Response,max=2000000){
 if(Number(response.headers.get('content-length'))>max)throw new IntegrationError(502,'The provider response was too large. Narrow the request.');
 const reader=response.body?.getReader();if(!reader)return '';let size=0;const decoder=new TextDecoder();let text='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new IntegrationError(502,'The provider response was too large.');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
