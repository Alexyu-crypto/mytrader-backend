import { useEffect, useState } from 'react';
import { Bitcoin, CalendarOff, CheckCircle2, Clock, MonitorSmartphone, Plus, Save, Timer, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AppSettings } from '@/lib/types';
import { DEFAULT_APP_SETTINGS } from '@/lib/types';
import { IconButton } from '@/components/IconButton';
import { BridgeKeyCard } from '@/components/rules/BridgeKeyCard';
import { IpAccessCard } from '@/components/rules/IpAccessCard';
import { LoginLogCard } from '@/components/rules/LoginLogCard';
import { useConfirm } from '@/hooks/useConfirm';

const inputCls =
  'w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-60 transition-colors';

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-12 h-6 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-emerald-500' : 'bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
    </button>
  );
}

function RuleCard({ icon: Icon, tone, title, hint, action, children }: {
  icon: typeof Clock;
  tone: string;
  title: string;
  hint: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className={`p-2 rounded-lg border ${tone}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-white font-semibold">{title}</h2>
          <p className="text-slate-400 text-sm mt-0.5">{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TradingRulesPage({ canEdit, isAdmin }: { canEdit: boolean; isAdmin: boolean }) {
  const ask = useConfirm();
  const [cfg, setCfg] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [cryptoInput, setCryptoInput] = useState('');

  useEffect(() => {
    supabase.from('app_settings').select('*').limit(1).maybeSingle().then(({ data, error: err }) => {
      if (err) setError('Could not load trading rules. Please refresh and try again. · 未能載入交易規則，請重新整理再試。');
      else if (data) setCfg(data as AppSettings);
      setLoaded(true);
    });
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setSavedAt(null);
  };

  const toggleMultiLogin = async () => {
    const next = !cfg.allow_multi_login;
    if (!next && !(await ask('Turn off multi-login? Every account will keep only its latest sign-in; other devices are signed out immediately.\n關閉多重登入？每個帳戶只保留最新一次登入，其他裝置會立即被強制登出。', { tone: 'warning', title: 'Turn off multi-login · 關閉多重登入', confirmLabel: 'Turn off · 關閉' }))) return;
    setError('');
    setCfg((c) => ({ ...c, allow_multi_login: next }));
    const { error: err } = cfg.id
      ? await supabase.from('app_settings').update({ allow_multi_login: next }).eq('id', cfg.id)
      : await supabase.from('app_settings').insert({ allow_multi_login: next });
    if (err) {
      setCfg((c) => ({ ...c, allow_multi_login: !next }));
      setError('Could not change multi-login. Please try again. · 未能更改多重登入設定，請再試。');
    }
  };

  const addCryptoSymbol = () => {
    const s = cryptoInput.trim().toUpperCase();
    if (s && !cfg.crypto_symbols.includes(s)) update({ crypto_symbols: [...cfg.crypto_symbols, s] });
    setCryptoInput('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const payload = {
      friday_close_enabled: cfg.friday_close_enabled,
      friday_close_utc_hour: cfg.friday_close_utc_hour,
      friday_close_safe_minutes: cfg.friday_close_safe_minutes,
      weekend_pause_enabled: cfg.weekend_pause_enabled,
      crypto_symbols: cfg.crypto_symbols,
      signal_max_age_sec: cfg.signal_max_age_sec,
    };
    const { data, error: err } = cfg.id
      ? await supabase.from('app_settings').update(payload).eq('id', cfg.id).select().maybeSingle()
      : await supabase.from('app_settings').insert(payload).select().maybeSingle();
    if (err) setError('Could not save trading rules. Please try again. · 未能儲存交易規則，請再試。');
    else {
      if (data) setCfg(data as AppSettings);
      setSavedAt(Date.now());
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading Rules · 交易規則</h1>
          <p className="text-slate-400 text-sm mt-1">Platform-wide rules that apply to every copy group and follower. · 適用於所有跟單組及跟單帳戶的全平台規則。</p>
        </div>
        {!canEdit && <span className="text-xs text-slate-500 border border-slate-700 rounded-lg px-3 py-2 whitespace-nowrap">View only · 只可查看</span>}
      </div>

      {!loaded ? (
        <div className="text-slate-400 text-center py-8">Loading rules... · 載入規則中...</div>
      ) : (
        <>
          <RuleCard
            icon={Clock}
            tone="bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
            title="Friday Close Protection · 週五收市保護"
            hint="Stop opening new positions shortly before the market closes on Friday. · 週五收市前一段時間停止開新倉。"
            action={<Toggle label="Friday close protection" on={cfg.friday_close_enabled} disabled={!canEdit} onChange={() => update({ friday_close_enabled: !cfg.friday_close_enabled })} />}
          >
            {cfg.friday_close_enabled && (
              <div className="grid sm:grid-cols-2 gap-4 animate-fade-in">
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Close hour (UTC, 0-23) · 收市時間（UTC，0-23）</label>
                  <input type="number" min="0" max="23" disabled={!canEdit} value={cfg.friday_close_utc_hour} onChange={(e) => update({ friday_close_utc_hour: parseInt(e.target.value) || 21 })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Stop new trades this many minutes before · 收市前多少分鐘停止開新倉</label>
                  <input type="number" min="1" max="120" disabled={!canEdit} value={cfg.friday_close_safe_minutes} onChange={(e) => update({ friday_close_safe_minutes: parseInt(e.target.value) || 15 })} className={inputCls} />
                </div>
              </div>
            )}
          </RuleCard>

          <RuleCard
            icon={CalendarOff}
            tone="bg-amber-500/10 text-amber-400 border-amber-500/20"
            title="Weekend Pause · 週末暫停"
            hint="Pause all copying on Saturday and Sunday. · 星期六及星期日暫停所有跟單。"
            action={<Toggle label="Weekend pause" on={cfg.weekend_pause_enabled} disabled={!canEdit} onChange={() => update({ weekend_pause_enabled: !cfg.weekend_pause_enabled })} />}
          />

          <RuleCard
            icon={Bitcoin}
            tone="bg-amber-500/10 text-amber-400 border-amber-500/20"
            title="Crypto Symbols (24/7) · 加密貨幣品種（24/7）"
            hint="These symbols keep copying through the weekend pause and Friday close protection. · 這些品種在週末暫停及週五收市保護期間仍會繼續跟單。"
          >
            {canEdit && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cryptoInput}
                  onChange={(e) => setCryptoInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCryptoSymbol())}
                  placeholder="e.g. BTCUSD · 例如 BTCUSD"
                  className={inputCls}
                />
                <IconButton label="Add crypto symbol · 新增" size="md" onClick={addCryptoSymbol}>
                  <Plus className="w-4 h-4" />
                </IconButton>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {cfg.crypto_symbols.length === 0 && <span className="text-slate-500 text-sm">No crypto symbols yet. · 未有加密貨幣品種。</span>}
              {cfg.crypto_symbols.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/20 px-2 py-1 rounded text-xs font-medium">
                  {s}
                  {canEdit && (
                    <button aria-label={`Remove ${s}`} onClick={() => update({ crypto_symbols: cfg.crypto_symbols.filter((x) => x !== s) })} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </RuleCard>

          <RuleCard
            icon={Timer}
            tone="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            title="Signal Max Age (seconds) · 訊號最長等待時間（秒）"
            hint="Signals still waiting after this many seconds are skipped, so followers never enter stale trades. · 訊號等待超過此秒數便會略過，避免跟單帳戶追入過時的交易。"
          >
            <input type="number" min="30" max="3600" disabled={!canEdit} value={cfg.signal_max_age_sec} onChange={(e) => update({ signal_max_age_sec: parseInt(e.target.value) || 300 })} className={`${inputCls} sm:max-w-xs`} />
          </RuleCard>

          <RuleCard
            icon={MonitorSmartphone}
            tone="bg-sky-500/10 text-sky-400 border-sky-500/20"
            title="Website Multi-Login · 網站多重登入"
            hint="Choose whether one website account may be signed in on several devices at once. · 設定同一網站帳戶可否同時在多部裝置登入。"
            action={
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${cfg.allow_multi_login ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {cfg.allow_multi_login ? 'ON · 開啟' : 'OFF · 關閉'}
                </span>
                <Toggle label="Allow multi-login" on={cfg.allow_multi_login} disabled={!canEdit} onChange={() => void toggleMultiLogin()} />
              </div>
            }
          >
            <div
              key={String(cfg.allow_multi_login)}
              className={`flex items-start gap-3 rounded-lg border p-4 animate-fade-in ${
                cfg.allow_multi_login ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'
              }`}
            >
              <span className={`mt-1 w-2.5 h-2.5 shrink-0 rounded-full ${cfg.allow_multi_login ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <div className="space-y-1">
                <p className={`text-sm font-semibold ${cfg.allow_multi_login ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {cfg.allow_multi_login
                    ? 'Current status: ON — multi-login allowed · 現況：已開啟 — 允許多重登入'
                    : 'Current status: OFF — one device per account · 現況：已關閉 — 每個帳戶只限一部裝置'}
                </p>
                <p className="text-sm text-slate-300">
                  {cfg.allow_multi_login
                    ? 'The same account can be signed in on several devices at the same time. · 同一帳戶可同時在多部裝置登入。'
                    : 'Each account keeps only ONE sign-in. Signing in on a new device immediately signs out the others. · 每個帳戶只可一處登入，新裝置登入後其他裝置會立即被強制登出。'}
                </p>
                <p className="text-xs text-slate-500">
                  Saved immediately when switched. Does not affect the MT4/MT5 trading terminals. · 切換後即時儲存及生效，不影響 MT4/MT5 EA 終端。
                </p>
              </div>
            </div>
          </RuleCard>

          {isAdmin && (
            <>
              <IpAccessCard
                settingsId={cfg.id}
                whitelistOn={!!cfg.ip_whitelist_enabled}
                onWhitelistChanged={(v) => setCfg((c) => ({ ...c, ip_whitelist_enabled: v }))}
              />
              <LoginLogCard />
            </>
          )}

          <BridgeKeyCard
            settingsId={cfg.id}
            required={!!cfg.bridge_key_required}
            canEdit={canEdit}
            onChanged={(v) => setCfg((c) => ({ ...c, bridge_key_required: v }))}
          />

          {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">{error}</div>}

          {canEdit && (
            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving... · 儲存中...' : 'Save rules · 儲存規則'}
              </button>
              {savedAt && (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 text-sm animate-fade-in">
                  <CheckCircle2 className="w-4 h-4" /> Saved · 已儲存
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
