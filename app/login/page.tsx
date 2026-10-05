import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AuthForm } from '@/components/auth/username-form';
export default async function LoginPage() {
  const db = await createClient();
  if (process.env.USERNAME_AUTH_ENABLED !== 'true') redirect('/');
  const { data: { user } } = await db.auth.getUser();
  const { data: handle } = user ? await db.from('user_handles').select('username').eq('user_id', user.id).maybeSingle() : { data: null };
  if (user && !user.is_anonymous && handle) redirect('/');
  const [chats, projects] = user?.is_anonymous ? await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    db.from('projects').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
  ]) : [{ count: 0 }, { count: 0 }];
  return <AuthForm signedIn={!!user && !user.is_anonymous} username={handle?.username ?? ''} hasGuestWork={!!(chats.count || projects.count)} />;
}
