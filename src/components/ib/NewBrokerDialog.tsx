import { useEffect, useState } from 'react';
import { Briefcase, Loader2, X } from 'lucide-react';
import { createBroker } from '@/lib/ibPartners';
import { Field } from '@/components/ib/IbFields';
import { IconButton } from '@/components/IconButton';

export function NewBrokerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ broker_name: '', website: '', regulation: '', region: '', contact_name: '', contact_email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.broker_name.trim()) {
      setError('Please enter the broker name. 請輸入經紀商名稱。');
      return;
    }
    setBusy(true);
    setError('');
    const { id, error: err } = await createBroker({ ...form, broker_name: form.broker_name.trim() });
    setBusy(false);
    if (err || !id) setError(err ?? 'Something went wrong. 操作失敗。');
    else onCreated(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <form onSubmit={submit} className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <div className="absolute right-4 top-4 flex">
          <IconButton label="Close · 關閉" tone="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 text-orange-300">
          <Briefcase className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">New IB application 新增代理申請</h2>
        <p className="mt-1 text-sm text-slate-400">Start a file for a broker. You can fill in the rest step by step. 先建立檔案，其餘資料可逐步補上。</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Broker name 經紀商名稱 *" value={form.broker_name} onChange={set('broker_name')} placeholder="e.g. IC Markets" span />
          <Field label="Website 網站" value={form.website} onChange={set('website')} placeholder="https://" />
          <Field label="Regulation 監管牌照" value={form.regulation} onChange={set('regulation')} placeholder="ASIC, FCA, CySEC…" />
          <Field label="Region 地區" value={form.region} onChange={set('region')} placeholder="Global, Asia…" />
          <Field label="Broker contact 對方聯絡人" value={form.contact_name} onChange={set('contact_name')} />
          <Field label="Contact email 聯絡電郵" value={form.contact_email} onChange={set('contact_email')} type="email" span />
        </div>

        {error && <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button type="submit" disabled={busy} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create 建立
          </button>
        </div>
      </form>
    </div>
  );
}
