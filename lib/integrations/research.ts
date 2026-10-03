import 'server-only';
import {boundedText,integrationConfig,IntegrationError,markIntegration,providerFetch} from '@/lib/integrations/server';
export interface ResearchResult {title:string;url:string;excerpt:string;}
export interface ToolResult {content:string;sources?:ResearchResult[];vectors?:number[][];jobId?:string;src?:string;pending?:boolean;}
const clean=(v:unknown)=>typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim():'';
const safeUrl=(v:unknown)=>{try{const u=new URL(String(v));return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const result=(title:unknown,url:unknown,excerpt:unknown):ResearchResult=>({title:clean(title).slice(0,250),url:safeUrl(url),excerpt:clean(excerpt).slice(0,900)});
const markdown=(rows:ResearchResult[])=>rows.map((r,i)=>`${i+1}. ${r.title}\n${r.url}\n${r.excerpt}`).join('\n\n')||'No matching results were returned. Try a more specific query.';
const arxivCache=new Map<string,{until:number;value:ToolResult}>();let arxivNext=0;
export async function runResearch(id:string,input:string,signal?:AbortSignal):Promise<ToolResult>{
 if(!input.trim()||input.length>4000)throw new IntegrationError(400,'Use between 1 and 4,000 characters.');
 const {key}=integrationConfig(id);const q=encodeURIComponent(input.trim());
 const auth:Record<string,string>=key?{Authorization:'Bearer '+key}:{};
 const headers:Record<string,string>={'Content-Type':'application/json',...auth};
 const get=async(url:string,h:HeadersInit={})=>JSON.parse(await boundedText(await providerFetch(id,url,{headers:h},signal)));
 const post=async(url:string,body:unknown,h:HeadersInit=headers)=>JSON.parse(await boundedText(await providerFetch(id,url,{method:'POST',headers:h,body:JSON.stringify(body)},signal)));
 let rows:ResearchResult[]=[];
 switch(id){
  case 'tavily':{const d=await post('https://api.tavily.com/search',{query:input,search_depth:'basic',max_results:5,include_answer:false});rows=(d.results??[]).map((r:{title:string;url:string;content:string})=>result(r.title,r.url,r.content));break;}
  case 'exa':{const d=await post('https://api.exa.ai/search',{query:input,numResults:5,contents:{text:{maxCharacters:900}}},{'Content-Type':'application/json','x-api-key':key!});rows=(d.results??[]).map((r:{title:string;url:string;text:string})=>result(r.title,r.url,r.text));break;}
  case 'brave':{const d=await get('https://api.search.brave.com/res/v1/web/search?q='+q+'&count=5',{'X-Subscription-Token':key!});rows=(d.web?.results??[]).map((r:{title:string;url:string;description:string})=>result(r.title,r.url,r.description));break;}
  case 'serper':{const d=await post('https://google.serper.dev/search',{q:input,num:5},{'Content-Type':'application/json','X-API-KEY':key!});rows=(d.organic??[]).map((r:{title:string;link:string;snippet:string})=>result(r.title,r.link,r.snippet));break;}
  case 'serpapi': case 'searchapi':{const base=id==='serpapi'?'https://serpapi.com/search.json':'https://www.searchapi.io/api/v1/search';const d=await get(base+'?engine=google&q='+q+'&api_key='+encodeURIComponent(key!)+'&num=5');rows=(d.organic_results??[]).slice(0,5).map((r:{title:string;link:string;snippet:string})=>result(r.title,r.link,r.snippet));break;}
  case 'firecrawl':{const d=await post('https://api.firecrawl.dev/v2/search',{query:input,limit:5,sources:['web'],timeout:30000});rows=(d.data?.web??[]).map((r:{title:string;url:string;description:string})=>result(r.title,r.url,r.description));break;}
  case 'openalex':{const d=await get('https://api.openalex.org/works?search='+q+'&per-page=5',auth);rows=(d.results??[]).map((r:{title:string;doi:string;id:string;publication_year:number})=>result(r.title,r.doi??r.id,'Published '+r.publication_year));break;}
  case 'semantic':{const d=await get('https://api.semanticscholar.org/graph/v1/paper/search?query='+q+'&limit=5&fields=title,url,abstract,year',key?{'x-api-key':key}:{});rows=(d.data??[]).map((r:{title:string;url:string;abstract:string})=>result(r.title,r.url,r.abstract));break;}
  case 'crossref':{const d=await get('https://api.crossref.org/works?query='+q+'&rows=5',{'User-Agent':'UnboundResearch/1.0 (https://unbound-lilac.vercel.app)'});rows=(d.message?.items??[]).map((r:{title:string[];URL:string;publisher:string})=>result(r.title?.[0],r.URL,r.publisher));break;}
  case 'wikimedia':{const d=await get('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+q+'&srlimit=5&format=json',{'User-Agent':'UnboundResearch/1.0 (https://unbound-lilac.vercel.app)'});rows=(d.query?.search??[]).map((r:{title:string;pageid:number;snippet:string})=>result(r.title,'https://en.wikipedia.org/?curid='+r.pageid,r.snippet));break;}
  case 'arxiv':{
   const cached=arxivCache.get(q);if(cached&&cached.until>Date.now())return cached.value;
   if(Date.now()<arxivNext)throw new IntegrationError(429,'arXiv requests are spaced three seconds apart. Please retry.',3);arxivNext=Date.now()+3100;
   const xml=await boundedText(await providerFetch(id,'https://export.arxiv.org/api/query?search_query=all:'+q+'&start=0&max_results=5',{},signal));
   const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
   rows=[...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m=>{const tag=(name:string)=>decode(m[1].match(new RegExp('<'+name+'>([\\s\\S]*?)<\\/'+name+'>'))?.[1]??'');return result(tag('title'),tag('id'),tag('summary'));});break;
  }
  case 'jina':{
   let u:URL;try{u=new URL(input);}catch{throw new IntegrationError(400,'Paste a public HTTPS webpage URL.');}
   if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||/localhost|\.local$|\.internal$|[\[\]:]/i.test(u.hostname))throw new IntegrationError(400,'Use a public HTTPS webpage URL.');
   const text=await boundedText(await providerFetch(id,'https://r.jina.ai/'+u.href,{headers:auth},signal),600000);markIntegration(id,'AVAILABLE');return {content:text.slice(0,50000),sources:[result(u.hostname,u.href,'Source webpage')]};
  }
  case 'voyage':{const texts=input.split('\n').filter(Boolean).slice(0,20);const d=await post('https://api.voyageai.com/v1/embeddings',{model:'voyage-4-lite',input:texts,input_type:'document'});const vectors=(d.data??[]).map((r:{embedding:number[]})=>r.embedding);if(!vectors.length||vectors.some((v:unknown)=>!Array.isArray(v)))throw new IntegrationError(502,'The embedding response was invalid.');markIntegration(id,'AVAILABLE');return {content:`Created ${vectors.length} embeddings with ${vectors[0].length} dimensions. Download the vectors for semantic search.`,vectors};}
  default:throw new IntegrationError(400,'This provider uses a different tool.');
 }
 markIntegration(id,'AVAILABLE');const output={content:markdown(rows),sources:rows};if(id==='arxiv'){if(arxivCache.size>100)arxivCache.clear();arxivCache.set(q,{until:Date.now()+300000,value:output});}return output;
}

