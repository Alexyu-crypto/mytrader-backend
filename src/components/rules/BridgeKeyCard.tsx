import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/hooks/useConfirm';

type Row = { account_name: string; last_seen: string | null; account_bridge_keys: { key_seen_at: string | null } | { key_seen_at: string | null }[] | null };

const RECENT_MS = 10 * 60 * 1000;

function isRecent(ts: string | null | undefined) {
  return !!ts && Date.now() - new Date(ts).getTime() < RECENT_MS;
}

export function BridgeKeyCard({ settingsId, required, canEdit, onChanged }: {
  settingsId: string | undefined;
  required: boolean;
  canEdit: boolean;
  onChanged: (required: boolean) => void;
}) {
  const ask = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('accounts')
      .select('account_name, last_seen, account_bridge_keys(key_seen_at)')
      .order('account_name');
    if (err) {
      console.error('bridge key status load failed', err);
      setError('Could not load terminal status. · 未能載入終端狀態。');
      setRows([]);
    } else setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const keySeen = (r: Row) => {
    const k = Array.isArray(r.account_bridge_keys) ? r.account_bridge_keys[0] : r.account_bridge_keys;
    return isRecent(k?.key_seen_at);
  };
  const online = (rows ?? []).filter((r) => isRecent(r.last_seen));
  const upgraded = online.filter(keySeen);
  const oldEa = online.filter((r) => !keySeen(r));

  const toggle = async () => {
    if (!settingsId) return;
    const next = !required;
    if (next && oldEa.length > 0 && !(await ask(`${oldEa.length} online terminal(s) still run the old EA and will stop working. Continue? 有 ${oldEa.length} 個在線終端仍用舊 EA，開啟後會即時停止運作，確定？`, { tone: 'warning', confirmLabel: 'Continue · 繼續' }))) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('app_settings').update({ bridge_key_required: next }).eq('id', settingsId);
    if (err) {
      console.error('bridge key switch failed', err);
      setError('Could not change this setting. Please try again. · 未能更改設定，請再試。');
    } else onChanged(next);
    setSaving(false);
  };

  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-lg border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          <KeyRound className="w-4 h-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-white font-semibold">Terminal Secret Key · 終端密鑰</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            When on, only terminals running the new EA with the account's own secret key can send positions or receive copy orders. · 開啟後，只有裝了新 EA（含帳戶密鑰）的終端才可傳送持倉或接收跟單指令。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={required}
          aria-label="Require terminal secret key"
          disabled={!canEdit || saving || !settingsId}
          onClick={toggle}
          className={`relative w-12 h-6 shrink-0 rounded-full transition-colors disabled:opacity-60 ${required ? 'bg-emerald-500' : 'bg-slate-600'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${required ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Checking terminals... · 檢查終端中...</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-400">Online with new EA · 已更新</p>
              <p className="text-lg font-semibold text-emerald-400">{upgraded.length}</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-400">Online with old EA · 未更新</p>
              <p className={`text-lg font-semibold ${oldEa.length ? 'text-amber-400' : 'text-slate-300'}`}>{oldEa.length}</p>
            </div>
          </div>
          {oldEa.length > 0 && (
            <p className="text-xs text-amber-300 leading-relaxed">
              <span>Reinstall the EA on these accounts · 請為以下帳戶重新安裝 EA</span>: <span className="font-mono">{oldEa.map((r) => r.account_name).join(', ')}</span>
            </p>
          )}
          <p className="text-xs text-slate-500">
            {required ? 'On: terminals without the correct key are refused. · 已開啟：沒有正確密鑰的終端會被拒絕。' : 'Off, transition period: old EAs still work, but a wrong key is always refused. · 過渡期：舊 EA 仍可用，但錯誤密鑰一律拒絕。'}
          </p>
        </div>
      )}
      {error && <div className="text-red-400 text-sm">{error}</div>}
    </section>
  );
}
