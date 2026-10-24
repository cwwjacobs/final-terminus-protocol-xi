const CODE = /^[a-f0-9]{32}$/;

/** Invite codes are room addresses, never session credentials. The optional
 * origin guard lets the UI accept its own share links without following URLs. */
export function normalizeInviteCode(value: unknown, expectedOrigin?: string): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const text = value.trim();
  const plain = text.replace(/[\s-]/g, '').toLowerCase();
  if (CODE.test(plain)) return plain;
  try {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.searchParams.getAll('room').length !== 1) return null;
    if (expectedOrigin && url.origin !== new URL(expectedOrigin).origin) return null;
    const code = url.searchParams.get('room')?.toLowerCase() ?? '';
    return CODE.test(code) ? code : null;
  } catch { return null; }
}

export function roomInviteUrl(origin: string, code: string): string {
  const normalized = normalizeInviteCode(code);
  const url = new URL(origin);
  if (!normalized || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid room invite.');
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', normalized);
  return url.toString();
}
