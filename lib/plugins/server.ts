import 'server-only';
import {boundedText} from '@/lib/integrations/server';
import {getPlugin} from '@/lib/plugins/registry';
export class PluginError extends Error{constructor(public status:number,message:string,public retryAfter?:string){super(message);}}
export function validatePluginInput(id:string,input:unknown):string{
 if(typeof input!=='string'||input.length>254)throw new PluginError(400,'Enter a valid tool request.');
 const v=input.trim();
 if(id==='vercel-domains'){
 const domain=v.toLowerCase();if(domain.length>253||!domain.includes('.')||!domain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))||/^\d+(\.\d+){3}$/.test(domain))throw new PluginError(400,'Enter an exact domain name, without a URL or path.');return domain;
 }
 if(id==='github-public'&&/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]{1,100}$/.test(v)&&!v.endsWith('/..')&&!v.endsWith('/.'))return v;
 throw new PluginError(400,'Enter a public repository as owner/repository.');
}
/** Fixed read adapters only. No arbitrary model-selected URLs, scripts or account mutations. */
export async function runPlugin(id:string,input:unknown,signal:AbortSignal){
 if(!getPlugin(id))throw new PluginError(409,'This integration is not connected or implemented. No action was performed.');
 const value=validatePluginInput(id,input);
 const response=await fetch(id==='vercel-domains'?'https://api.vercel.com/v1/registrar/domains/search':'https://api.github.com/repos/'+value,{...(id==='vercel-domains'?{method:'POST',body:JSON.stringify({domains:[value]})}:{}),headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'Unbound-Public-Tools'},redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
 if(!response.ok){await response.body?.cancel();throw new PluginError(response.status===429?429:response.status===403?403:response.status===404?404:502,response.status===404?'This public repository was not found.':response.status===429?'The provider rate limit was reached. Please wait before trying again.':'The provider could not complete this lookup. Please try again later.',/^\d{1,5}$/.test(response.headers.get('retry-after')??'')?response.headers.get('retry-after')!:undefined);}
 const data=JSON.parse(await boundedText(response,100000));let output:unknown;
 if(id==='vercel-domains'){
 const row=data.results?.find((r:{domain?:string})=>r.domain===value);if(!row||typeof row.available!=='boolean')throw new PluginError(502,'The provider returned an unreadable domain result.');
 output={domain:value,available:row.available,registrationUSD:typeof row.price==='number'?row.price:null,renewalUSD:typeof row.renewalPrice==='number'?row.renewalPrice:null,years:typeof row.years==='number'?row.years:null,premium:row.premium===true,notice:'Unavailable can also mean unconfirmed. Prices can change before checkout; taxes and other fees are not quoted here.'};
 }else{if(typeof data.full_name!=='string'||data.private!==false)throw new PluginError(502,'The provider did not return a public repository.');output={repository:data.full_name,description:typeof data.description==='string'?data.description.slice(0,2000):null,defaultBranch:data.default_branch,language:data.language,stars:data.stargazers_count,archived:data.archived,url:'https://github.com/'+value};}
 return {plugin:id,data:output,trust:'untrusted_external_data',checkedAt:new Date().toISOString()};
}
