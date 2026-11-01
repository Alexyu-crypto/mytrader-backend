/*
# Record the build code of each PC install package

1. Modified Tables
- `terminal_installations`
  - `build` (text, nullable): short code identifying the EA + installer files inside the downloaded package.
2. Security
- No policy changes. The column is written only by the terminal-installer edge function (service role).
3. Notes
1. The installer compares its own build code with the newest package's code and warns when it is an old file.
*/

ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS build text;
CREATE INDEX IF NOT EXISTS terminal_installations_created_at_idx ON terminal_installations (created_at DESC);