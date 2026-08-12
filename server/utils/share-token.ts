import { randomBytes } from 'node:crypto'

/** Long, URL-safe, cryptographically random token — the only barrier between
 * "private" and "public" for a shared note, so it needs to resist brute force. */
export function createShareToken(): string {
  return randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
