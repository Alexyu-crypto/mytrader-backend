import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Globe2, Info, Loader2, MapPin, X } from 'lucide-react';
import { fetchMetaApiRegions, METAAPI_REGIONS, moveMetaApiRegion, regionLabel } from '@/lib/metaapi';
import type { Account } from '@/lib/types';

interface Props {
  account: Account;
  onClose: () => void;
  onMoved: (message: string) => void;
}

export function MoveRegionDialog({ account, onClose, onMoved }: Props) {
  const current = account.metaapi_region ?? null;
  const [target, setTarget] = useState<string | null>(account.metaapi_moving_to ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMetaApiRegions().then((res) => {
      if (!alive) return;
      if (res.error) setError(res.error);
      setAllowed(res.regions);
    });
    return () => {
      alive = false;
    };
  }, []);

  const options = [
    ...METAAPI_REGIONS.map((r) => ({ id: r.id as string, label: r.label as string, country: r.country as string })),
    ...(allowed ?? []).filter((id) => !METAAPI_REGIONS.some((r) => r.id === id)).map((id) => ({ id, label: id, country: '--' })),
  ];
  const canMove = !!allowed && allowed.some((id) => id !== current);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    const res = await moveMetaApiRegion(account.id, target);
    setBusy(false);
    if (res.error) return setError(res.error);
    onMoved(res.pending
      ? `${account.account_name}: MetaApi 仍在建立 ${regionLabel(target)} 終端，稍後再撳一次「轉換」。 Still creating, press switch again shortly.`
      : `${account.account_name}: 已轉到 ${regionLabel(target)}，約 1-2 分鐘內會重新上線。 Moved; it should reconnect in 1-2 minutes.`);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={busy ? undefined : onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">轉換其他地區 · Switch region</h2>
            <p className="mt-1 font-mono text-xs text-amber-400">{account.account_name}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <MapPin className="w-4 h-4 text-sky-400" /> 目前地區 · Current:
            <span className="text-slate-200">{regionLabel(current)}{account.metaapi_zone ? ` · Zone ${account.metaapi_zone.toUpperCase()}` : ''}</span>
          </div>

          {allowed === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> 正在向 MetaApi 查詢可用地區… Checking available regions…
            </div>
          ) : (
          <div className="grid gap-2">
            {options.map((r) => {
              const isCurrent = r.id === current;
              const onPlan = allowed.includes(r.id);
              const selected = r.id === target;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={isCurrent || !onPlan || busy}
                  onClick={() => setTarget(r.id)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${
                    selected ? 'border-sky-500/60 bg-sky-500/10 ring-1 ring-sky-500/40' : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300">{r.country}</span>
                    <span className="text-sm text-slate-100">{r.label}</span>
                  </span>
                  {isCurrent ? <span className="text-[11px] text-slate-500">目前 · Current</span>
                    : !onPlan ? <span className="text-[11px] text-slate-500">方案未包括 · Not on plan</span>
                    : selected ? <Check className="w-4 h-4 text-sky-300" /> : <Globe2 className="w-4 h-4 text-slate-600" />}
                </button>
              );
            })}
          </div>
          )}

          {allowed !== null && !canMove && !error && (
            <div className="flex gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-xs leading-relaxed text-sky-100">
              <Info className="w-4 h-4 shrink-0 text-sky-300" />
              <span>你目前的 MetaApi 方案只提供 {allowed.map(regionLabel).join('、') || '—'}，暫時未能轉到其他地區。如需紐約或新加坡，請先在 MetaApi 後台開通該地區。<br />Your MetaApi plan only includes {allowed.map(regionLabel).join(', ') || '—'}. Enable more regions in your MetaApi account to switch.</span>
            </div>
          )}

          {canMove && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-100">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300" />
              <span>轉換時會喺新地區開一個新雲端終端，再刪除舊嗰個。帳戶會斷線約 1-2 分鐘，期間唔會跟單。<br />A new cloud terminal is created in the new region and the old one removed. The account goes offline for 1-2 minutes and won't copy trades meanwhile.</span>
            </div>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors">取消 · Cancel</button>
          <button type="button" onClick={submit} disabled={!target || target === current || !allowed?.includes(target) || busy} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-50 transition-colors">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} 確認轉換 · Switch
          </button>
        </div>
      </div>
    </div>
  );
}
