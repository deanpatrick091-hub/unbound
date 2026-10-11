import type {ModelOption} from '@/lib/ai/types';
import {rankFallbacks} from '@/lib/ai/routing';
export function selectBuildModel(models:ModelOption[],instruction:string,inputCharacters:number){
 const complex=/dashboard|commerce|booking|multi.page|application|platform|database|full.stack/i.test(instruction)||inputCharacters>24000;
 const outputTokens=complex?16000:10000;
 const candidates=rankFallbacks(models.filter(m=>!m.health||m.health.state==='available'),'build',inputCharacters,outputTokens);
 const selected=candidates.find(m=>!m.maxOutputTokens||m.maxOutputTokens>=outputTokens)??candidates[0];
 return {model:selected?.id,outputTokens,complexity:complex?'complex':'standard'};
}
