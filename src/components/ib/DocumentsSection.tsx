import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckSquare, ExternalLink, FileText, Loader2, Paperclip, Square, Trash2, Upload } from 'lucide-react';
import { DOCUMENTS } from '@/lib/ibPartners';
import { ACCEPT, deleteDocument, docLabel, fetchDocuments, formatSize, openDocument, uploadDocument, type IbDocument } from '@/lib/ibDocuments';
import { formatTime } from '@/lib/format';
import { Hint, IconButton } from '@/components/IconButton';

interface Props {
  brokerId: string;
  checked: Record<string, boolean>;
  onToggle: (key: string) => void;
  onUploaded: (key: string) => void;
}

export function DocumentsSection({ brokerId, checked, onToggle, onUploaded }: Props) {
  const [docs, setDocs] = useState<IbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKey = useRef('other');

  const load = useCallback(async () => {
    const res = await fetchDocuments(brokerId);
    setDocs(res.docs);
    if (res.error) setError(res.error);
    setLoading(false);
  }, [brokerId]);

  useEffect(() => { load(); }, [load]);

  const pick = (key: string) => {
    pendingKey.current = key;
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const key = pendingKey.current;
    setUploadingKey(key);
    setError('');
    let anyOk = false;
    for (const file of files) {
      const err = await uploadDocument(brokerId, key, file);
      if (err) setError(`${file.name}: ${err}`);
      else anyOk = true;
    }
    setUploadingKey(null);
    await load();
    if (anyOk) onUploaded(key);
  };

  const run = async (doc: IbDocument, action: (d: IbDocument) => Promise<string | null>, reload: boolean) => {
    setBusyId(doc.id);
    const err = await action(doc);
    setBusyId(null);
    setError(err ?? '');
    if (reload && !err) await load();
  };

  const countFor = (key: string) => docs.filter((d) => d.doc_key === key).length;
  const done = DOCUMENTS.filter((d) => checked[d.key]).length;

  return (
    <section>
      <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={onFile} />
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Document checklist 文件清單</h3>
        <span className="text-xs tabular-nums text-slate-400">{done} / {DOCUMENTS.length}</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${(done / DOCUMENTS.length) * 100}%` }} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {DOCUMENTS.map((d) => {
          const isChecked = !!checked[d.key];
          const Icon = isChecked ? CheckSquare : Square;
          const count = countFor(d.key);
          return (
            <div
              key={d.key}
              className={`flex items-center rounded-lg border text-sm transition-colors ${
                isChecked ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              <button type="button" onClick={() => onToggle(d.key)} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left">
                <Icon className={`h-4 w-4 shrink-0 ${isChecked ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="truncate">{d.label}</span>
              </button>
              {count > 0 && (
                <Hint label={`${count} files attached · 已附檔案`}>
                  <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                    <Paperclip className="h-3 w-3" /> {count}
                  </span>
                </Hint>
              )}
              <span className="m-1 flex">
                <IconButton label="Upload file · 上載文件" tone="ghost" onClick={() => pick(d.key)} disabled={uploadingKey !== null}>
                  {uploadingKey === d.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                </IconButton>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Uploaded files 已上載文件</h4>
        <IconButton label="Upload other file · 上載其他文件" tone="slate" onClick={() => pick('other')} disabled={uploadingKey !== null}>
          {uploadingKey === 'other' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        </IconButton>
      </div>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
      ) : docs.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-700 px-4 py-4 text-center text-xs text-slate-500">
          No files yet. Use the upload buttons above (PDF, image, Word, Excel · max 15 MB). 尚未上載文件。
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 animate-fade-in">
              <FileText className="h-4 w-4 shrink-0 text-sky-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{doc.file_name}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {docLabel(doc.doc_key)} · {formatSize(doc.size_bytes)} · {doc.uploaded_email || '—'} · {formatTime(doc.created_at)}
                </p>
              </div>
              <IconButton label="Open · 開啟" tone="ghost" onClick={() => run(doc, openDocument, false)} disabled={busyId === doc.id}>
                {busyId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              </IconButton>
              {confirmId === doc.id ? (
                <span className="flex items-center gap-1 animate-fade-in">
                  <button onClick={() => { setConfirmId(null); run(doc, deleteDocument, true); }} className="rounded-md bg-red-500/15 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/25">Remove 刪除</button>
                  <button onClick={() => setConfirmId(null)} className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800">Keep</button>
                </span>
              ) : (
                <IconButton label="Remove · 刪除" tone="red" onClick={() => setConfirmId(doc.id)} disabled={busyId === doc.id}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
