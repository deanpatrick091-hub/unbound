import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {getSiteOrigin} from '@/lib/auth/site-url';
export async function GET(request:Request){const code=new URL(request.url).searchParams.get('code');if(code){const db=await createClient();const {error}=await db.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(getSiteOrigin()+'/settings');}return NextResponse.redirect(getSiteOrigin()+'/settings?auth=retry');}
