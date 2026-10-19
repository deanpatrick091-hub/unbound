import 'server-only';
import {getProviderConfig} from '@/lib/ai/providers';
import {selfHostedImageConfig} from '@/lib/images/self-hosted';
export function imageProviders(){return [
 ...(selfHostedImageConfig()?[{id:'self-hosted',name:'Your image server',notice:'Uses your configured LocalAI hardware. No hosted inference credit; hardware and electricity costs apply.'}]:[]),
 ...(getProviderConfig('cloudflare')?[{id:'cloudflare',name:'FLUX.1 Schnell · Cloudflare',notice:'Uses the connected Workers AI free allowance.'}]:[]),
 {id:'aihorde',name:'Realistic Vision / Deliberate · AI Horde',notice:'Free community generation; variable queues and low anonymous priority. Volunteers process your prompt. Anonymous generations are shared for dataset research; never include private information.'},
 ...(getProviderConfig('huggingface')?[{id:'huggingface',name:'FLUX.1 Schnell · Hugging Face',notice:'Requires Hugging Face inference credit. Free accounts currently receive no monthly inference credits. Used only when you select it explicitly.'}]:[]),
];}
