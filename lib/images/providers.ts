import 'server-only';
import {getProviderConfig} from '@/lib/ai/providers';
export function imageProviders(){return [
 ...(getProviderConfig('huggingface')?[{id:'huggingface',name:'FLUX.1 Schnell · Hugging Face',notice:'Uses your connected free credit; stops when exhausted.'}]:[]),
 ...(getProviderConfig('cloudflare')?[{id:'cloudflare',name:'FLUX.1 Schnell · Cloudflare',notice:'Uses the connected Workers AI free allowance.'}]:[]),
];}
