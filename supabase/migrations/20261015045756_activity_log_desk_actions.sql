/*
# Allow Trading Desk actions in the activity log

1. Modified functions
- `log_activity`: the action allow-list now also accepts `desk_order` (an order sent from the Trading Desk)
  and `desk_modify` (SL/TP changed from the Trading Desk). Everything else is unchanged.

2. Security
- Still SECURITY DEFINER with a fixed search_path, still requires a signed-in user.
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
IF p_action NOT IN ('sign_in', 'sign_out', 'sign_up', 'password_changed', 'page_view', 'view_report', 'export', 'close_position', 'close_all_positions', 'desk_order', 'desk_modify') THEN
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
