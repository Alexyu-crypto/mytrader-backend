-- copy_settings, engine_log, engine_state and app_settings were readable by the
-- anon role (the public key), exposing the whole copy configuration and engine
-- internals to the internet. None of them is read by the EA bridge.

DROP POLICY IF EXISTS anon_select_copy_settings ON public.copy_settings;
CREATE POLICY operator_select_copy_settings ON public.copy_settings
  FOR SELECT TO authenticated
  USING (can_view_all());

DROP POLICY IF EXISTS anon_select_engine_log ON public.engine_log;
CREATE POLICY operator_select_engine_log ON public.engine_log
  FOR SELECT TO authenticated
  USING (can_view_all());

DROP POLICY IF EXISTS anon_select_engine_state ON public.engine_state;
CREATE POLICY operator_select_engine_state ON public.engine_state
  FOR SELECT TO authenticated
  USING (can_view_all());

DROP POLICY IF EXISTS anon_select_app_settings ON public.app_settings;
CREATE POLICY member_select_app_settings ON public.app_settings
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
