export function normalizeUsername(value) {
  if (typeof value !== 'string') return null;
  const username = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(username)) return null;
  if (['admin','administrator','support','unbound','system','moderator'].includes(username)) return null;
  return username;
}
export function validPassword(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128;
}
