/*
# Fix terminal_file_needs column name

## Summary
The accounts table stores the trading server in `broker_server`, not `server`.
This re-creates `terminal_file_needs()` to read the correct column. Same output,
same access rule (admin, trader, broker_files only). Safe to re-run.
*/

CREATE OR REPLACE FUNCTION public.terminal_file_needs()
RETURNS TABLE(platform text, broker text, server text, accounts bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT can_manage_terminal_files() THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY
    SELECT a.platform::text, coalesce(a.broker,'')::text, coalesce(a.broker_server,'')::text, count(*)
    FROM accounts a
    WHERE coalesce(a.broker_server,'') <> '' OR coalesce(a.broker,'') <> ''
    GROUP BY 1,2,3
    ORDER BY 4 DESC;
END $$;
REVOKE ALL ON FUNCTION public.terminal_file_needs() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.terminal_file_needs() TO authenticated;
