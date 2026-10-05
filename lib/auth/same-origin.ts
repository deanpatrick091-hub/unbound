/** Compare the browser origin with the HTTP authority, not Next's internal URL. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && ['http:', 'https:'].includes(parsed.protocol)
      && parsed.host === host;
  } catch { return false; }
}
