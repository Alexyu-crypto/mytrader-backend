DO $$
DECLARE
  def text := pg_get_functiondef('public.run_copy_engine'::regproc);
  needle text := 'a.last_seen > v_now - interval ''15 seconds''';
BEGIN
  IF position(needle in def) = 0 THEN
    RAISE EXCEPTION 'run_copy_engine: 15s window text not found';
  END IF;
  EXECUTE replace(def, needle, 'a.last_seen > v_now - interval ''45 seconds''');
END $$;