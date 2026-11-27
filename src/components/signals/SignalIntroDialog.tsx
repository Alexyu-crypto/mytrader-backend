import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const MAX = 1000;

export function SignalIntroDialog({ accountName, initial, onClose, onSaved }: { accountName: string; initial: string; onClose: () => void; onSaved: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    const { error: err } = await supabase.rpc('set_signal_intro', { p_account_name: accountName, p_intro: text });
    setSaving(false);
    if (err) {
      setError('Could not save. Please try again. 未能儲存，請再試。');
      return;
    }
    onSaved(text.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-fade-in">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Signal intro 信號介紹</h3>
            <p className="mt-0.5 truncate text-xs text-slate-400">{accountName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          rows={6}
          autoFocus
          placeholder="Describe this strategy for visitors... 為訪客介紹此策略..."
          className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>Leave empty to hide. 留空即不顯示。</span>
          <span className="tabular-nums">{text.length}/{MAX}</span>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800">
            Cancel 取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-cyan-400 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save 儲存
          </button>
        </div>
      </div>
    </div>
  );
}
