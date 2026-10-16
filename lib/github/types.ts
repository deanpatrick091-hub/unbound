export type GitHubConnectionRow = {
  user_id: string; connection_id: string; credential_ciphertext: string; verified_at: string;
  refresh_lock_until: string; refresh_lock_id: string | null; created_at: string;
};
export type GitHubOAuthStateRow = {
  user_id: string; state_hash: string; state_ciphertext: string; claimed: boolean; expires_at: string;
};
export type GitHubStatus = {
  state: 'SETUP_REQUIRED' | 'DISCONNECTED' | 'CONNECTED' | 'RECONNECT_REQUIRED' | 'UNAVAILABLE';
  login?: string; verifiedAt?: string; installUrl?: string; message?: string;
};
