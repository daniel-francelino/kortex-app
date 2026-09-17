/**
 * 3-30 chars, lowercase letters/digits/hyphen only, can't start/end with a
 * hyphen, no consecutive hyphens. Also reused for scheduling-page slugs
 * (server/utils/slug.ts) since the shape is identical — see
 * docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §6.2.
 *
 * Deliberately an allow-list (only a-z0-9-), not a blocklist of "bad"
 * characters — a value passes only if every character is one we explicitly
 * decided is safe, so anything unanticipated is rejected by default. This
 * matters for a few concrete reasons, not just "keep it simple":
 *
 * - **URL-reserved characters** (`/ ? # % & @ : ;`, spaces, control chars)
 *   would break routing (`/` splits the path into extra segments) or force
 *   percent-encoding, making the shared link ugly/ambiguous. Excluded by the
 *   allow-list.
 * - **Dot (`.`)** is excluded even though Instagram/Twitter allow it in
 *   usernames — here a username IS the entire path segment right after the
 *   domain (`kortex.app/{username}`), so `kortex.app/michael.norris` reads
 *   uncomfortably close to a sub-host or a filename (`favicon.ico`-style).
 * - **Non-ASCII/Unicode is excluded entirely — this is a deliberate security
 *   property, not an oversight.** Allowing arbitrary Unicode invites
 *   homograph/confusable attacks: a Cyrillic "с" (U+0441) is visually
 *   indistinguishable from Latin "c" in most fonts, so "miсhael" could
 *   impersonate a real "michael" profile. Do not loosen this pattern to
 *   support accented/non-Latin names without adding real confusable-script
 *   detection (e.g. Unicode TR39) first — that's a project of its own, not a
 *   one-line regex change.
 * - **Consecutive hyphens** (`michael--norris`) aren't a security issue, just
 *   cosmetic — checked separately below since expressing "no two hyphens in a
 *   row" cleanly inside the character-class regex itself gets unreadable.
 */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/

export function isValidUsernameFormat(value: string): boolean {
  return USERNAME_PATTERN.test(value) && !value.includes('--')
}
