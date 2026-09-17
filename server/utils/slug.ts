import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidUsernameFormat } from './username'

// Room for a "-<suffix>" from ensureUniqueSlug below while staying inside the
// 30-char ceiling isValidUsernameFormat enforces everywhere else — a slug
// this function ever produces must stay valid forever, including the next
// time the host re-saves the page without touching the slug field (the
// editor's PATCH endpoint re-validates it every time, see
// scheduling-pages/[id].patch.ts).
const SLUGIFY_BASE_MAX_LENGTH = 24

/** Same shape/safety rules as a username (server/utils/username.ts) —
 * lowercase, hyphens, no leading/trailing/consecutive hyphen — but slugified
 * from an arbitrary title first, which can be empty, all-punctuation, or
 * accented. The accent-stripping step (NFKD + combining-mark removal) mirrors
 * what the SQL backfill in supabase/migrations/20260917020000_scheduling_
 * pages_slug.sql does with `unaccent()`, so old and new slugs are generated
 * the same way. */
export function slugify(input: string): string {
  const base = input
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alnum -> a single hyphen (never consecutive)
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUGIFY_BASE_MAX_LENGTH)
    .replace(/-+$/g, '') // slicing above can re-expose a trailing hyphen

  const candidate = base.length >= 3 ? base : `${base ? `${base}-` : ''}evento`

  // Belt-and-suspenders: every value this function returns must already pass
  // the same validation a user-typed slug would, or a future refactor here
  // could silently start writing values the rest of the system would reject.
  return isValidUsernameFormat(candidate) ? candidate : 'evento'
}

/**
 * Appends -2, -3, ... until a slug that isn't already taken *by this same
 * user* is found — slugs are only unique per (user_id, slug), not globally
 * (docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §6.1). `excludeId`
 * lets a page keep its own slug when just re-saving unrelated fields.
 */
export async function ensureUniqueSlug(
  supabase: SupabaseClient,
  userId: string,
  base: string,
  excludeId?: string
): Promise<string> {
  let candidate = base
  let suffix = 2

  for (;;) {
    let query = supabase
      .from('scheduling_pages')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', candidate)

    if (excludeId) query = query.neq('id', excludeId)

    const { data } = await query.maybeSingle()
    if (!data) return candidate
    candidate = `${base}-${suffix++}`
  }
}
