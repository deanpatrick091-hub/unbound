import { getAvailableModels } from "@/lib/ai/discovery";
import { getSession } from "@/lib/auth/session";
export async function GET() {
  const { user } = await getSession();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  return Response.json({ models: await getAvailableModels() }, { headers: { "Cache-Control": "private, no-store" } });
}
