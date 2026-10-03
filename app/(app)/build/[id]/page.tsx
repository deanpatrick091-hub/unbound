import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects/server';
import { BuilderWorkspace } from '@/components/build/builder-workspace';
export default async function ProjectPage({params}:{params:Promise<{id:string}>}){
 const project=await getProject((await params).id);if(!project)notFound();
 return <BuilderWorkspace model={project.model} project={project}/>;
}
