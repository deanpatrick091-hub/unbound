import { getSession } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { getProject } from "@/lib/projects/server";
import { parseDesign } from "@/lib/design/registry";
import { applyDesign } from "@/lib/design/render";
import { siteByteSize } from "@/lib/build/assemble";
import { BUILD_LIMITS } from "@/lib/build/types";
import { isRecord } from "@/lib/chat/validation";
import type { Json } from "@/lib/supabase/database.types";

/** Saves design + rendered source atomically through the same RLS/CAS path as generation. */
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  if(!isSameOrigin(request)) return Response.json({error:"Reload this page."},{status:403});
  const {user,supabase} = await getSession();
  if(!user) return Response.json({error:"Sign in to continue."},{status:401});
  const text=await request.text();
  if(text.length>2500) return Response.json({error:"Design settings are too large."},{status:400});
  let body: unknown;
  try {body=JSON.parse(text);} catch {return Response.json({error:"Invalid design settings."},{status:400});}
  if(!isRecord(body) || !Number.isSafeInteger(body.revision)) return Response.json({error:"Reopen the project before saving."},{status:400});
  const design=parseDesign(body.design);
  if(!design) return Response.json({error:"Choose a supported style, combination and motion setting."},{status:400});
  const project=await getProject((await params).id);
  if(!project) return Response.json({error:"Project unavailable."},{status:404});
  if(project.role==="viewer") return Response.json({error:"This project is read-only."},{status:403});
  if(project.revision!==body.revision) return Response.json({error:"Another editor saved changes. Reopen this project before applying a design."},{status:409});
  let files;
  try {files=design.styles.length?applyDesign(project.files,design):project.files;} catch {return Response.json({error:"This older website needs a complete HTML head and body. Ask the builder to complete the document first."},{status:422});}
  if(siteByteSize(files)>BUILD_LIMITS.maxSiteBytes) return Response.json({error:"This website is too large to apply the design safely."},{status:422});
  const settings=isRecord(project.settings)?project.settings:{};
  const {data,error}=await supabase.rpc("save_project",{p_id:project.id,p_revision:project.revision,p_files:files as Json,p_conversation:project.conversation as unknown as Json,p_model:project.model,p_settings:{...settings,design} as unknown as Json,p_preview:project.preview_state});
  if(error) return Response.json({error:error.code==="40001"?"Another editor saved changes. Reopen this project.":"The design could not be saved. Your previous version is safe."},{status:error.code==="40001"?409:503});
  return Response.json({design,files,revision:data},{headers:{"Cache-Control":"private, no-store"}});
}
