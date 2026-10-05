import 'server-only';
import {getProviderConfig} from '@/lib/ai/providers';
export function videoAvailable(){return !!getProviderConfig('huggingface');}
export async function generateVideo(prompt:string,aspectRatio:'16:9'|'9:16',signal:AbortSignal){
 const config=getProviderConfig('huggingface');if(!config||config.kind!=='openai-compatible'||!config.apiKey)throw Error('Video generation is unavailable.');
 const {InferenceClient}=await import('@huggingface/inference');
 const client=new InferenceClient(config.apiKey);const model='Wan-AI/Wan2.1-T2V-1.3B';
 const blob=await client.textToVideo({provider:'fal-ai',model,inputs:prompt,parameters:{num_frames:81,aspect_ratio:aspectRatio}},{signal});
 if(blob.size>24*1024*1024||blob.size<16)throw Error('Video exceeds storage limits.');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if(String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw Error('Provider did not return an MP4.');
 return {bytes,model};
}
