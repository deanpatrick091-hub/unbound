import type {TextAttachment} from '@/lib/chat/attachments';
/** Public metadata only: no credentials and no execution code. */
export const CHAT_TOOLS=[
 {id:'tavily',label:'Search the web'},
 {id:'image',label:'Create image'}, {id:'video',label:'Create video'},
 {id:'github',label:'GitHub'}, {id:'github-public',label:'Public repository'},
 {id:'vercel-domains',label:'Domain lookup'}, {id:'wikimedia',label:'Wikipedia'},
 {id:'crossref',label:'Crossref'}, {id:'openalex',label:'OpenAlex'},
 {id:'semantic',label:'Semantic Scholar'}, {id:'arxiv',label:'arXiv'},
 {id:'jina',label:'Read webpage'}, {id:'npm',label:'npm packages'}, {id:'openlibrary',label:'Open Library'},
] as const;
export type ChatToolId=typeof CHAT_TOOLS[number]['id'];
export interface ChatToolOptions {attachments?:TextAttachment[];tool?:ChatToolId;communityConsent?:boolean;aspectRatio?:'16:9'|'9:16'}
export function naturalMediaTool(text:string):ChatToolId|undefined{
 if(/^\s*(?:please\s+)?(?:generate|create|make|draw)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration)\b/i.test(text))return 'image';
 if(/^\s*(?:please\s+)?(?:generate|create|make)\s+(?:me\s+)?(?:an?\s+)?(?:video|clip)\b/i.test(text))return 'video';
}
export type MediaArtifact={kind:'image'|'image-job'|'video';id:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function artifactText(value:MediaArtifact){if(!uuid.test(value.id))throw Error('Invalid artifact');return '\n\n```unbound-media\n'+JSON.stringify(value)+'\n```';}
export function splitArtifact(content:string):{text:string;artifact?:MediaArtifact}{
 const match=content.match(/\n\n```unbound-media\n([^\n]{1,160})\n```$/);if(!match)return {text:content};
 try{const v=JSON.parse(match[1]);if(['image','image-job','video'].includes(v.kind)&&typeof v.id==='string'&&uuid.test(v.id))return {text:content.slice(0,match.index),artifact:{kind:v.kind,id:v.id}};}catch{}
 return {text:content};
}

/** Conservative routing based only on the current prompt, never history or attachments. */
export function needsWebSearch(text:string):boolean {
 const q=text.trim();
 if(/\b(?:do not|don't|dont|without|never)\s+(?:use\s+)?(?:web\s+)?(?:search|brows(?:e|ing))|\boffline only\b/i.test(q))return false;
 if(/^(?:please\s+)?search\s+(?:for|about)\b/i.test(q)&&! /\b(?:my|our)\s+(?:files|emails|documents|messages)\b/i.test(q))return true;
 if(/\b(?:search|browse)\s+(?:the\s+)?(?:web|internet|online)|\b(?:web|internet)\s+search\b|\blook\s+.{0,80}\bup\b|\bfind\s+(?:me\s+)?(?:sources|citations)\b|^\s*(?:please\s+)?(?:google|search online|research)\b/i.test(q))return true;
 // Creative/editing requests do not need automatic research just because they say "today".
 if(/^(?:please\s+)?(?:write|rewrite|translate|summari[sz]e|edit|draft|imagine|build|create|generate)\b/i.test(q))return false;
 return /\b(?:latest|current|currently|today|tonight|tomorrow|this week|this month|right now|recent news|breaking news)\b/i.test(q)||/\b(?:weather|forecast|stock price|exchange rate|election results|live score)\b/i.test(q)||/\bwho (?:is|are)\b.{0,80}\b(?:president|prime minister|ceo|leader)\b/i.test(q);
}
export function selectedChatTool(prompt:string,options?:ChatToolOptions):ChatToolId|undefined {
 if(options?.attachments?.length)return undefined;
 return options?.tool??naturalMediaTool(prompt)??(needsWebSearch(prompt)?'tavily':undefined);
}
