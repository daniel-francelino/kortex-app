-- ═══════════════════════════════════════════════════════════════════════════════
-- Looks up a user's id by email. Needed to resolve note_shares.shared_with_user_id
-- when a note is shared with someone who already has an account, and again at
-- login time to reconcile pending invites (see server/utils/reconcile-pending-shares.ts).
-- auth.users is not exposed via PostgREST, so a SECURITY DEFINER function is the
-- standard way to read it — restricted to service_role only, since it lets a
-- caller check whether an arbitrary email has an account.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(lookup_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
