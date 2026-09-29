/** Verified official free API models, reviewed 2026-09-29. No credentials here. */
export const ADDITIONAL_CHAT = {
 sambanova:{label:'SambaNova',env:'SAMBANOVA_API_KEY',baseUrl:'https://api.sambanova.ai/v1',models:['DeepSeek-V3.1','Meta-Llama-3.3-70B-Instruct','gpt-oss-120b'],allowance:'No-payment-method Free tier: 20 requests/minute, 20/day and 200,000 tokens/day per listed model.',source:'https://docs.sambanova.ai/docs/en/models/rate-limits'},
 cohere:{label:'Cohere',env:'COHERE_API_KEY',baseUrl:'https://api.cohere.ai/compatibility/v1',models:['north-mini-code-1-0'],allowance:'North Mini Code has no token charge until the account rate limit. Trial keys: 1,000 calls/month; production deployment terms must be checked.',source:'https://docs.cohere.com/docs/north-mini-code-1.0'},
} as const;
export type AdditionalChatId=keyof typeof ADDITIONAL_CHAT;
export function isAdditionalChat(id:string):id is AdditionalChatId{return Object.hasOwn(ADDITIONAL_CHAT,id);}
