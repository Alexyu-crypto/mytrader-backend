/*
# VDS window command result

1. Modified Tables
- `terminal_installations`
  - `desktop_command_result` (text, nullable): short message the VDS sends back after it handles a
    "re-arrange" or "next page" request (how many MT windows it found, which page, or the error).
2. Security
- No policy changes. Only the installer edge function (service role) writes this column.
*/
ALTER TABLE terminal_installations ADD COLUMN IF NOT EXISTS desktop_command_result text;
