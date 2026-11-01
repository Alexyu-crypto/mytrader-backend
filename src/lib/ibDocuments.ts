import { supabase } from '@/lib/supabase';
import { addEvent, DOCUMENTS } from '@/lib/ibPartners';

const BUCKET = 'ib-documents';
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';

export interface IbDocument {
  id: string;
  broker_id: string;
  doc_key: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  uploaded_email: string;
  created_at: string;
}

export const docLabel = (key: string) => DOCUMENTS.find((d) => d.key === key)?.label ?? 'Other 其他文件';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function fetchDocuments(brokerId: string): Promise<{ docs: IbDocument[]; error: string | null }> {
  const { data, error } = await supabase
    .from('ib_documents')
    .select('id, broker_id, doc_key, file_name, storage_path, size_bytes, mime_type, uploaded_email, created_at')
    .eq('broker_id', brokerId)
    .order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) return { docs: [], error: 'Could not load files. 未能載入文件。' };
  return { docs: data as IbDocument[], error: null };
}

export async function uploadDocument(brokerId: string, docKey: string, file: File): Promise<string | null> {
  if (file.size > MAX_BYTES) return 'File is larger than 15 MB. 檔案超過 15 MB。';
  if (!ALLOWED.has(file.type)) return 'Only PDF, image, Word or Excel files. 只接受 PDF、圖片、Word 或 Excel。';
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'file';
  const path = `${brokerId}/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return 'Upload failed. Please try again. 上載失敗，請再試。';
  const { error } = await supabase.from('ib_documents').insert({
    broker_id: brokerId,
    doc_key: docKey,
    file_name: file.name.slice(0, 200),
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return 'Upload failed. Please try again. 上載失敗，請再試。';
  }
  await addEvent(brokerId, 'document', `Uploaded 上載文件: ${docLabel(docKey)} · ${file.name}`.slice(0, 2000));
  return null;
}

export async function openDocument(doc: IbDocument): Promise<string | null> {
  // Open the tab synchronously so popup blockers allow it, then point it at the short-lived link.
  const tab = window.open('about:blank', '_blank');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
  if (error || !data?.signedUrl) {
    tab?.close();
    return 'Could not open the file. 未能開啟文件。';
  }
  if (tab) {
    tab.opener = null;
    tab.location.href = data.signedUrl;
  } else {
    window.location.assign(data.signedUrl);
  }
  return null;
}

export async function deleteDocument(doc: IbDocument): Promise<string | null> {
  const { error } = await supabase.from('ib_documents').delete().eq('id', doc.id);
  if (error) return 'Could not remove the file. 未能刪除文件。';
  await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  await addEvent(doc.broker_id, 'document', `Removed 刪除文件: ${docLabel(doc.doc_key)} · ${doc.file_name}`.slice(0, 2000));
  return null;
}
