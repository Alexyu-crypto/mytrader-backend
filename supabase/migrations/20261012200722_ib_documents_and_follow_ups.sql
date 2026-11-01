/*
# IB application documents and automatic follow-up scheduling

1. Storage
  - New private bucket `ib-documents` (15 MB per file; PDF, images, Word, Excel only).
  - Files live under `<broker_id>/...`; only active admins / IB managers can upload, view or remove,
    and only into the folder of a broker that exists. No overwrite (no update policy).

2. New Tables
  - `ib_documents`: one row per uploaded file.
    - broker_id (fk ib_brokers, cascade), doc_key (checklist item or 'other'), file_name,
      storage_path (unique), size_bytes, mime_type, uploaded_by (from session), uploaded_email, created_at.

3. Automatic follow-ups
  - Trigger `ib_auto_follow_up` on `ib_brokers`: when a file is created or moved to a new stage and
    the user did not pick a date themselves, the next follow-up date is set automatically
    (prospect +7 days, submitted +3, under review +5, negotiating +3). Approved / rejected clear it.

4. Security
  - RLS on `ib_documents`: select / insert / delete for can_manage_ib(); no update; anon revoked.
  - Uploader identity is filled from the session and cannot be supplied by the client.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ib-documents', 'ib-documents', false, 15728640, ARRAY[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ib_docs_storage_select" ON storage.objects;
CREATE POLICY "ib_docs_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ib-documents' AND public.can_manage_ib());
DROP POLICY IF EXISTS "ib_docs_storage_insert" ON storage.objects;
CREATE POLICY "ib_docs_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ib-documents' AND public.can_manage_ib()
    AND EXISTS (SELECT 1 FROM public.ib_brokers b WHERE b.id::text = (storage.foldername(name))[1])
  );
DROP POLICY IF EXISTS "ib_docs_storage_delete" ON storage.objects;
CREATE POLICY "ib_docs_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ib-documents' AND public.can_manage_ib());

CREATE TABLE IF NOT EXISTS ib_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES ib_brokers(id) ON DELETE CASCADE,
  doc_key text NOT NULL CHECK (char_length(doc_key) BETWEEN 1 AND 40),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  storage_path text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  mime_type text NOT NULL DEFAULT '',
  uploaded_by uuid DEFAULT auth.uid(),
  uploaded_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ib_documents_broker_idx ON ib_documents (broker_id, created_at DESC);

ALTER TABLE ib_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ib_documents FROM anon;

DROP POLICY IF EXISTS "ib_select_documents" ON ib_documents;
CREATE POLICY "ib_select_documents" ON ib_documents FOR SELECT TO authenticated USING (can_manage_ib());
DROP POLICY IF EXISTS "ib_insert_documents" ON ib_documents;
CREATE POLICY "ib_insert_documents" ON ib_documents FOR INSERT TO authenticated
  WITH CHECK (can_manage_ib() AND storage_path LIKE broker_id::text || '/%');
DROP POLICY IF EXISTS "ib_delete_documents" ON ib_documents;
CREATE POLICY "ib_delete_documents" ON ib_documents FOR DELETE TO authenticated USING (can_manage_ib());

CREATE OR REPLACE FUNCTION public.ib_documents_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  NEW.uploaded_by := auth.uid();
  NEW.uploaded_email := coalesce(auth.jwt() ->> 'email', '');
  NEW.created_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ib_documents_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ib_documents_stamp ON ib_documents;
CREATE TRIGGER ib_documents_stamp BEFORE INSERT ON ib_documents FOR EACH ROW EXECUTE FUNCTION ib_documents_stamp();

CREATE OR REPLACE FUNCTION public.ib_auto_follow_up()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE v_days int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage = OLD.stage THEN RETURN NEW; END IF;
  IF NEW.stage IN ('approved', 'rejected') THEN
    NEW.next_follow_up := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.next_follow_up IS DISTINCT FROM OLD.next_follow_up AND NEW.next_follow_up IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.next_follow_up IS NOT NULL THEN RETURN NEW; END IF;
  v_days := CASE NEW.stage WHEN 'prospect' THEN 7 WHEN 'submitted' THEN 3 WHEN 'review' THEN 5 WHEN 'negotiating' THEN 3 ELSE 7 END;
  NEW.next_follow_up := current_date + v_days;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ib_auto_follow_up ON ib_brokers;
CREATE TRIGGER ib_auto_follow_up BEFORE INSERT OR UPDATE ON ib_brokers FOR EACH ROW EXECUTE FUNCTION ib_auto_follow_up();
