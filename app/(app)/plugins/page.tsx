import {PluginMarketplace} from '@/components/plugins/plugin-marketplace';
import {integrationStatuses} from '@/lib/integrations/server';
export default async function Plugins({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;return <PluginMarketplace initialApp={typeof params.github==='string'?'github':undefined} tools={integrationStatuses().filter(p=>['research','reader','embeddings'].includes(p.kind))}/>;}
