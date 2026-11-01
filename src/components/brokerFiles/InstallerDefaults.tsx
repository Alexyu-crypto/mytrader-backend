import { useEffect, useState } from 'react';
import { CheckCircle2, Save } from 'lucide-react';
import { loadInstallerLinks, saveInstallerLinks, type InstallerLinks, type LibraryFile } from '@/lib/brokerFiles';

const isUrl = (v: string) => !v.trim() || /^https:\/\/[^\s]+$/i.test(v.trim());

export function InstallerDefaults({ library }: { library: LibraryFile[] }) {
  const [links, setLinks] = useState<InstallerLinks>({ mt4_installer_url: '', mt5_installer_url: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadInstallerLinks().then(setLinks).catch((e: Error) => setError(e.message));
  }, []);

  const save = async () => {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      await saveInstallerLinks(links);
      setNotice('Saved. 已儲存。');
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };

  const valid = isUrl(links.mt4_installer_url) && isUrl(links.mt5_installer_url);

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-slate-400">
        A new PC installs the setup program of its account's broker. When that broker has no setup in the library, it uses the default below, then the download link.
        <span className="block text-slate-500">新電腦會先安裝該券商的專屬安裝程式；如沒有，就用以下預設程式，再沒有就用下載連結。要更換預設，請在「檔案庫」按星號。</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {(['MT4', 'MT5'] as const).map((p) => {
          const current = library.find((f) => f.isDefault && f.platform === p);
          return (
            <div key={p} className={`rounded-xl border p-4 transition-colors ${current ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
              <p className="font-semibold text-white">{p} default setup 預設安裝程式</p>
              {current ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> {(current.sizeKb / 1024).toFixed(1)} MB · {current.updatedAt ? new Date(current.updatedAt).toLocaleDateString() : ''}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">Not set. Star a setup in the Library tab. 未設定，請在檔案庫按星號。</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Backup download links · 後備下載連結</h3>
        {(['MT4', 'MT5'] as const).map((p) => {
          const key = p === 'MT4' ? 'mt4_installer_url' : 'mt5_installer_url';
          const ok = isUrl(links[key]);
          return (
            <label key={p} className="block max-w-xl">
              <span className="text-xs text-slate-400">{p} setup link (.exe, https)</span>
              <input
                value={links[key]}
                maxLength={500}
                onChange={(e) => setLinks((s) => ({ ...s, [key]: e.target.value }))}
                placeholder={`https://.../${p.toLowerCase()}setup.exe`}
                className={`mt-1 w-full rounded-lg border bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none ${ok ? 'border-slate-700 focus:border-rose-400' : 'border-red-500/60'}`}
              />
              {!ok && <span className="text-xs text-red-400">Must start with https://</span>}
            </label>
          );
        })}
        <button onClick={save} disabled={!valid || saving} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3.5 py-2 text-sm font-medium text-black transition-colors hover:bg-rose-400 disabled:opacity-40">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save links 儲存'}
        </button>
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
