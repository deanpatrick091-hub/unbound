import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { GitHubError, context, credentialSchema, decrypt, encrypt } from '@/lib/github/security';
import { revokeGitHubToken, tokenRequest } from '@/lib/github/provider';

export function storageError() { return new GitHubError(503, 'STORAGE_UNAVAILABLE', 'GitHub connection storage is unavailable. Check the GitHub migration and try again.'); }
export async function connection(db: ServerSupabaseClient, userId: string) {
  const { data, error } = await db.from('github_connections').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw storageError();
  return data;
}
export async function currentConnection(db: ServerSupabaseClient, userId: string, id: string) {
  const row = await connection(db, userId);
  return row?.connection_id === id;
}
export async function credentials(db: ServerSupabaseClient, userId: string, signal?: AbortSignal) {
  const row = await connection(db, userId);
  if (!row) throw new GitHubError(409, 'DISCONNECTED', 'Connect your GitHub account first.');
  let value = decrypt(row.credential_ciphertext, context(userId, row.connection_id), credentialSchema);
  if (value.expiresAt > Date.now() + 60000) return { row, value };
  if (value.refreshExpiresAt <= Date.now()) throw new GitHubError(409, 'RECONNECT_REQUIRED', 'Your GitHub authorization expired. Connect again.');
  const lockId = randomUUID();
  const locked = await db.from('github_connections').update({ refresh_lock_id: lockId, refresh_lock_until: new Date(Date.now() + 45000).toISOString() })
    .eq('user_id', userId).eq('connection_id', row.connection_id).eq('credential_ciphertext', row.credential_ciphertext)
    .lt('refresh_lock_until', new Date().toISOString()).select('connection_id').maybeSingle();
  if (locked.error) throw storageError();
  if (!locked.data) throw new GitHubError(409, 'REFRESH_IN_PROGRESS', 'GitHub access is being refreshed. Please try again in a moment.');
  try {
    const refreshed = await tokenRequest({ grant_type: 'refresh_token', refresh_token: value.refreshToken }, signal);
    value = { ...value, ...refreshed };
    const saved = await db.from('github_connections').update({ credential_ciphertext: encrypt(value, context(userId, row.connection_id)), refresh_lock_id: null, refresh_lock_until: '1970-01-01T00:00:00Z' })
      .eq('user_id', userId).eq('connection_id', row.connection_id).eq('refresh_lock_id', lockId).select('connection_id').maybeSingle();
    if (saved.error || !saved.data) { await revokeGitHubToken(value.accessToken); throw new GitHubError(409, 'RECONNECT_REQUIRED', 'GitHub access changed. Connect again.'); }
    return { row, value };
  } finally {
    await db.from('github_connections').update({ refresh_lock_id: null, refresh_lock_until: '1970-01-01T00:00:00Z' }).eq('user_id', userId).eq('connection_id', row.connection_id).eq('refresh_lock_id', lockId);
  }
}
