import {getPlugin} from '@/lib/plugins/registry';
/** Model text proposes a read only. It cannot authorize a write or invent a target. */
export function parseToolProposal(text:string,question:string):{plugin:string;input:string}|null{
 let value;try{value=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return null;}
 if(!value||typeof value.plugin!=='string'||typeof value.input!=='string'||value.input.length>254||!getPlugin(value.plugin))return null;
 if(!value.input.trim()||!question.toLowerCase().includes(value.input.toLowerCase()))return null;
 return {plugin:value.plugin,input:value.input};
}
