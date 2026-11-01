/*
# Allow "close all orders" in the activity log

1. Changes
- `log_activity` now also accepts the action `close_all_positions`, so pressing
  "Close all" on a copy group is recorded in the staff activity log.
2. Security
- Unchanged: caller must be signed in; action and category stay allow-listed.
*/

CREATE OR REPLACE FUNCTION public.log_activity(p_action text, p_category text, p_target text DEFAULT NULL::text, p_meta jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_actor uuid := auth.uid();
BEGIN
IF v_actor IS NULL THEN
RAISE EXCEPTION 'Not authorized';
END IF;
IF p_action NOT IN ('sign_in', 'sign_out', 'sign_up', 'password_changed', 'page_view', 'view_report', 'export', 'close_position', 'close_all_positions') THEN
RAISE EXCEPTION 'Invalid action';
END IF;
IF p_category NOT IN ('auth', 'navigation', 'report', 'history', 'copy_requests', 'positions') THEN
RAISE EXCEPTION 'Invalid category';
END IF;
IF p_meta IS NOT NULL AND length(p_meta::text) > 2000 THEN
p_meta := NULL;
END IF;

INSERT INTO activity_log (actor_id, actor_email, action, category, target, meta)
VALUES (v_actor, (SELECT m.email FROM app_members m WHERE m.user_id = v_actor), p_action, p_category, left(p_target, 300), p_meta);
END;
$function$;