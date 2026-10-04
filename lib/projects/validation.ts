import type {ChatMessage} from '@/lib/chat/types';
export function parseSavedConversation(value:unknown):ChatMessage[]{
 if(!Array.isArray(value))return [];
 return value.filter((v):v is Record<string,unknown>=>!!v&&typeof v==='object').filter(v=>typeof v.id==='string'&&(v.role==='user'||v.role==='assistant')&&typeof v.content==='string').map(v=>({id:v.id as string,role:v.role as 'user'|'assistant',content:v.content as string,createdAt:typeof v.createdAt==='number'?v.createdAt:0,status:v.status==='error'?'error':v.status==='cancelled'?'cancelled':'complete'}));
}
