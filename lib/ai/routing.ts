import type {ModelOption} from './types';
/** Approximate sizing only; providers enforce their own tokenizers and context. */
export function rankFallbacks(models:ModelOption[],task:'chat'|'build',inputCharacters:number,outputTokens:number){
 const estimate=Math.ceil(inputCharacters/3)+outputTokens;
 return models.filter(m=>!m.contextLength||m.contextLength>=estimate).sort((a,b)=>score(b)-score(a));
 function score(m:ModelOption){
  const coding=/coder|code|gpt-oss|qwen|deepseek|laguna/i.test(m.model);
  return (task==='build'&&coding?100:0)+(m.health?.state==='available'?10:0)+(m.provider==='kilo'||m.provider==='openrouter'?5:0);
 }
}
