/*
# UI translation cache

1. New Tables
- `ui_translations`: remembers machine translations of interface text so each phrase is translated only once.
  - `lang` (text) target language code (en, zh-Hant, ja, es, fr, de, id, ru, la, ar)
  - `source_hash` (text) SHA-256 of the original text
  - `source` (text) original interface text
  - `translated` (text) translated text
  - `created_at` (timestamptz)
  - Primary key (lang, source_hash)

2. Security
- RLS enabled with NO policies: browsers cannot read or write this table directly.
  Only the `translate-ui` edge function (service role) reads and fills it.

3. Notes
1. Purely a cache; deleting rows only causes re-translation.
*/

CREATE TABLE IF NOT EXISTS ui_translations (
  lang text NOT NULL,
  source_hash text NOT NULL,
  source text NOT NULL,
  translated text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lang, source_hash)
);

ALTER TABLE ui_translations ENABLE ROW LEVEL SECURITY;
