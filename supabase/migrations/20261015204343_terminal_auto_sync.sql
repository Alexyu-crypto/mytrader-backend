/*
# Installed PCs keep themselves in sync with the website

1. Modified Tables
- `terminal_installations`
  - `follow_group` (boolean, default false): the PC follows its copy group, so it adds MT terminals for new followers, removes them for followers that leave, and follows the group when its master changes.
  - `ea_code` (text): bridge EA version currently running on the PC.
  - `synced_at` (timestamptz): last time the PC checked in for updates.
  - `sync_message` (text): what the last check changed on the PC.

2. New Tables
- `terminal_release` (single row, id = 1): the newest bridge EA and control script read from the website, cached so PCs can download them.
  - `site_origin` (text): website address the files are read from (set only when an admin creates a package).
  - `ea_code`, `control_code` (text): short version codes.
  - `files` (jsonb): file contents.
  - `checked_at` (timestamptz): when the website was last read.

3. Security
- RLS enabled on `terminal_release` with NO policies: only the server-side installer function can read or write it, so nobody can push code to PCs from the browser.

4. Notes
1. Existing packages created by admins / traders are switched to follow their group.
*/

ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS follow_group boolean NOT NULL DEFAULT false;
ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS ea_code text;
ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS synced_at timestamptz;
ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS sync_message text;

UPDATE terminal_installations t SET follow_group = true
WHERE follow_group = false
  AND EXISTS (SELECT 1 FROM app_members m WHERE m.user_id = t.created_by AND m.role IN ('admin', 'trader'));

CREATE TABLE IF NOT EXISTS terminal_release (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_origin text,
  ea_code text,
  control_code text,
  files jsonb,
  checked_at timestamptz
);

ALTER TABLE terminal_release ENABLE ROW LEVEL SECURITY;

INSERT INTO terminal_release (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
