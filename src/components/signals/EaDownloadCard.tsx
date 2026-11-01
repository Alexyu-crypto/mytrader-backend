import { useState } from 'react';
import { Download, FlaskConical, Loader2 } from 'lucide-react';

interface Props {
  file: string;
  title: string;
  description: string;
  descriptionZh: string;
}

export function EaDownloadCard({ file, title, description, descriptionZh }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/downloads/${file}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('#property strict') || !text.includes('OnTick')) {
        throw new Error('The published site does not have the EA file yet. Please publish the site again, then retry. 網站未有此 EA 檔案，請重新發佈網站後再試。');
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <span className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 grid place-items-center shrink-0">
          <FlaskConical className="w-5 h-5 text-amber-400" />
        </span>
        <div className="flex-1 min-w-[16rem]">
          <p className="text-white text-sm font-medium">{title}</p>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed">
            {description}
            <span className="block">{descriptionZh}</span>
          </p>
        </div>
        <button
          onClick={download}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download {file}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </section>
  );
}
