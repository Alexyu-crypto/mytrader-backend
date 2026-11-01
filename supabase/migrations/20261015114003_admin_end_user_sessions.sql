/*
# Admin password reset: end the user's sign-ins

1. New Functions
- `admin_end_user_sessions(p_user uuid)`: removes every sign-in session of one user, so after an admin sets
  a new password the user must sign in again with it on every device.

2. Security
- EXECUTE only for `service_role` (called by the admin-users server function after it verifies the caller
  is an active full admin). Not callable by anon or signed-in users.
*/

CREATE OR REPLACE FUNCTION public.admin_end_user_sessions(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$ DELETE FROM auth.sessions WHERE user_id = p_user $$;

REVOKE ALL ON FUNCTION public.admin_end_user_sessions(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_end_user_sessions(uuid) TO service_role;
