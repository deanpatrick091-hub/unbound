export const PLUGINS=[
 {id:'vercel-domains',name:'Vercel Domain Search',category:'deployment',description:'Check exact domain availability and quoted registration/renewal prices. Does not buy domains.',permissions:'Only the domain name you request is sent to Vercel.',inputLabel:'example.com',limits:'Public API without an account token. Provider quotas apply. Registration and renewal cost money.',docs:'https://vercel.com/docs/domains/registrar-api'},
 {id:'github-public',name:'GitHub Public Repository',category:'coding',description:'Read public repository metadata. No private access, messages, issues or write operations.',permissions:'Only the public owner/repository name you request is sent to GitHub.',inputLabel:'owner/repository',limits:'Unauthenticated REST rate limits are shared by server IP. No paid API subscription required for this read.',docs:'https://docs.github.com/en/rest/repos/repos'},
] as const;
export type PluginId=typeof PLUGINS[number]['id'];
export function getPlugin(id:string){return PLUGINS.find(p=>p.id===id);}
/** Standard allowlisted tool schema; future write tools require a separate approval executor. */
export const PUBLIC_TOOL_SCHEMA={type:'object',properties:{plugin:{type:'string',enum:PLUGINS.map(p=>p.id)},input:{type:'string',maxLength:254}},required:['plugin','input'],additionalProperties:false} as const;
