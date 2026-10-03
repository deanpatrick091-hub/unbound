import {ToolWorkspace} from '@/components/integrations/tool-workspace';
import {integrationStatuses} from '@/lib/integrations/server';
export default function ToolsPage(){return <ToolWorkspace initial={integrationStatuses()}/>;}
