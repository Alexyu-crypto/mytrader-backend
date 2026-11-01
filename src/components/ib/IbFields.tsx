import { Check, Loader2 } from 'lucide-react';

export const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20';

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  span = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  span?: boolean;
}) {
  return (
    <label className={`block ${span ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </label>
  );
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">— Select 請選擇 —</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function SaveBar({ dirty, busy, saved, error, onSave }: { dirty: boolean; busy: boolean; saved: boolean; error: string; onSave: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
      {error && <p className="mr-auto text-sm text-red-300">{error}</p>}
      {saved && !dirty && (
        <span className="flex items-center gap-1 text-sm text-emerald-300">
          <Check className="h-4 w-4" /> Saved 已儲存
        </span>
      )}
      <button
        onClick={onSave}
        disabled={!dirty || busy}
        className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Save 儲存
      </button>
    </div>
  );
}
