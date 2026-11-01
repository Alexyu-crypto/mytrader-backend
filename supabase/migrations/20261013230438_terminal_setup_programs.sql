/*
# Store MT4 / MT5 setup programs for the PC installer

1. New storage
  - Private bucket `terminal-setups` (100 MB per file) holding one setup program per platform:
    `mt4/setup.exe` and `mt5/setup.exe`.
  - The terminal installer edge function hands the PC a short-lived signed link to these files,
    so brand-new PCs can install MT without anyone picking a file by hand.

2. Security
  - Only `can_operate()` staff can list, upload, replace or delete files in this bucket.
  - No public access; PCs only receive time-limited signed links from the edge function.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('terminal-setups', 'terminal-setups', false, 104857600)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "operators_select_terminal_setups" ON storage.objects;
CREATE POLICY "operators_select_terminal_setups" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'terminal-setups' AND can_operate());
DROP POLICY IF EXISTS "operators_insert_terminal_setups" ON storage.objects;
CREATE POLICY "operators_insert_terminal_setups" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'terminal-setups' AND can_operate());
DROP POLICY IF EXISTS "operators_update_terminal_setups" ON storage.objects;
CREATE POLICY "operators_update_terminal_setups" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'terminal-setups' AND can_operate()) WITH CHECK (bucket_id = 'terminal-setups' AND can_operate());
DROP POLICY IF EXISTS "operators_delete_terminal_setups" ON storage.objects;
CREATE POLICY "operators_delete_terminal_setups" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'terminal-setups' AND can_operate());
