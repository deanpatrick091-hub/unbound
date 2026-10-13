import {GitHubIntegration} from '@/components/github/github-integration';
import {ToolWorkspace} from '@/components/integrations/tool-workspace';
import {integrationStatuses} from '@/lib/integrations/server';
export default function ToolsPage(){return <div className="h-full overflow-auto"><GitHubIntegration/><ToolWorkspace initial={integrationStatuses().filter(p=>p.status!=="CONFIGURATION REQUIRED"&&["research","reader","embeddings"].includes(p.kind))}/></div>;}
