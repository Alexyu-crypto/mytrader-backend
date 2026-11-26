import { useEffect, useState } from 'react';
import { X, Eye, EyeOff, Loader2, Download, ShieldCheck, ShieldAlert } from 'lucide-react';
import { buildAccountName, MAX_ACCOUNT_NAME_LENGTH } from '@/lib/accountImport';
import { fetchAgentClients, type AgentClient } from '@/lib/agents';
import { submitAccountRequest, RISK_ACTION_LABELS, type RiskAction } from '@/lib/accountRequests';

const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-slate-400 text-sm font-medium mb-1">{label}</span>
      {children}
      {hint && <span className="block text-slate-500 text-xs mt-1">{hint}</span>}
    </label>
  );
}

export function RequestAccountDialog({ isAgent, masters, onClose, onSubmitted }: {
  isAgent: boolean;
  masters: string[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [clients, setClients] = useState<AgentClient[]>([]);
  const [clientsError, setClientsError] = useState('');
  const [forUserId, setForUserId] = useState('');
  const [holderName, setHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [broker, setBroker] = useState('');
  const [brokerServer, setBrokerServer] = useState('');
  const [platform, setPlatform] = useState<'MT4' | 'MT5'>('MT4');
  const [masterAccount, setMasterAccount] = useState(masters[0] ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [riskOn, setRiskOn] = useState(true);
  const [riskPct, setRiskPct] = useState('');
  const [riskAction, setRiskAction] = useState<RiskAction>('stop_new');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAgent) return;
    let live = true;
    fetchAgentClients().then((res) => {
      if (!live) return;
      setClients(res.clients.filter((c) => c.status === 'active'));
      if (res.error) setClientsError(res.error);
    });
    return () => { live = false; };
  }, [isAgent]);

  const accountName = buildAccountName('follower', holderName, accountNumber, broker);
  const tooLong = accountName.length > MAX_ACCOUNT_NAME_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!holderName.trim() || !accountNumber.trim() || !broker.trim() || !password) {
      setError('Please fill in all required fields. 請填寫所有必填欄位。');
      return;
    }
    if (!masterAccount) {
      setError('Please choose a master account to follow. 請選擇要跟隨的主帳戶。');
      return;
    }
    const pct = Number(riskPct);
    if (riskOn && (!riskPct || !Number.isFinite(pct) || pct <= 0 || pct > 100)) {
      setError('Enter a stop-loss between 0.01% and 100%. 請輸入 0.01% 至 100% 的止損。');
      return;
    }
    setSaving(true);
    const err = await submitAccountRequest({
      holderName, accountNumber, broker, brokerServer, platform, masterAccount, password,
      forUserId: isAgent && forUserId ? forUserId : null,
      riskPct: riskOn ? pct : null,
      riskAction: riskOn ? riskAction : null,
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onSubmitted();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold text-white">Add Follower Account 新增跟單帳戶</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-slate-400 text-xs mb-4">
          An admin will review this account before copying starts. 帳戶須經管理員批准後才開始跟單。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-300 text-xs">
            <Download className="w-4 h-4 shrink-0" />
            Connection: EA Installer only 連線方式：只限 EA 安裝
          </div>

          {isAgent && (
            <Field label="Account owner 帳戶擁有人" hint={clientsError || undefined}>
              <select value={forUserId} onChange={(e) => setForUserId(e.target.value)} className={inputCls}>
                <option value="">Myself 我自己</option>
                {clients.map((c) => (
                  <option key={c.user_id} value={c.user_id}>{c.email}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Account holder name 帳戶持有人 *">
            <input value={holderName} onChange={(e) => setHolderName(e.target.value)} maxLength={100} placeholder="e.g. Chan Tai Man" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Account number 帳戶號碼 *">
              <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" placeholder="12345678" className={inputCls} />
            </Field>
            <Field label="Platform 平台">
              <div className="grid grid-cols-2 gap-2">
                {(['MT4', 'MT5'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPlatform(p)} aria-pressed={platform === p}
                    className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${platform === p ? 'bg-cyan-500 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Broker 經紀商 *">
            <input value={broker} onChange={(e) => setBroker(e.target.value)} maxLength={60} placeholder="e.g. FXPRO" className={inputCls} />
          </Field>

          <Field label="Broker server 伺服器">
            <input value={brokerServer} onChange={(e) => setBrokerServer(e.target.value)} maxLength={120} placeholder="e.g. FxPro-MT4 Real" className={inputCls} />
          </Field>

          <Field label="Trading password 交易密碼 *">
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64} autoComplete="new-password" className={`${inputCls} pr-10`} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white" aria-label="Toggle password">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          <Field label="Follow master 跟隨主帳戶 *">
            <select value={masterAccount} onChange={(e) => setMasterAccount(e.target.value)} className={inputCls}>
              {masters.length === 0 && <option value="">No master accounts 沒有主帳戶</option>}
              {masters.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>

          <section className={`rounded-xl border p-4 transition-colors ${riskOn ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700 bg-slate-900/40'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className={`w-4 h-4 ${riskOn ? 'text-amber-400' : 'text-slate-500'}`} />
                <span className="text-white text-sm font-semibold">Risk settings 風控設定</span>
              </div>
              <button type="button" role="switch" aria-checked={riskOn} onClick={() => setRiskOn((v) => !v)}
                className={`relative w-10 h-6 rounded-full transition-colors ${riskOn ? 'bg-amber-500' : 'bg-slate-700'}`}>
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${riskOn ? 'translate-x-4' : ''}`} />
              </button>
            </div>

            {riskOn ? (
              <div className="mt-4 space-y-3">
                <Field label="Stop-loss 止損 % *" hint="Measured from the starting balance when the account first connects. 以帳戶首次連線時的結餘計算。">
                  <div className="relative">
                    <input value={riskPct} onChange={(e) => setRiskPct(e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} inputMode="decimal" placeholder="e.g. 30" className={`${inputCls} pr-9`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                  </div>
                </Field>
                <div>
                  <span className="block text-slate-400 text-sm font-medium mb-1">When reached 到達後</span>
                  <div className="space-y-2">
                    {(Object.keys(RISK_ACTION_LABELS) as RiskAction[]).map((key, i) => {
                      const active = riskAction === key;
                      return (
                        <button key={key} type="button" onClick={() => setRiskAction(key)} aria-pressed={active}
                          className={`w-full flex items-start gap-3 text-left rounded-lg border px-3 py-2.5 transition-colors ${active ? (key === 'close_all' ? 'border-red-500/50 bg-red-500/10' : 'border-amber-500/50 bg-amber-500/10') : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}>
                          <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${active ? (key === 'close_all' ? 'border-red-400' : 'border-amber-400') : 'border-slate-600'}`}>
                            {active && <span className={`w-1.5 h-1.5 rounded-full ${key === 'close_all' ? 'bg-red-400' : 'bg-amber-400'}`} />}
                          </span>
                          <span>
                            <span className="block text-white text-sm font-medium">{i + 1}. {RISK_ACTION_LABELS[key].title}</span>
                            <span className="block text-slate-400 text-xs mt-0.5">{RISK_ACTION_LABELS[key].desc}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-slate-500 text-xs">No automatic stop-loss. 不設自動止損。</p>
            )}
          </section>

          {accountName.split('-').length >= 4 && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${tooLong ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
              Account name 帳戶名稱: <span className="font-mono text-white">{accountName}</span>
              {tooLong && <span className="block mt-1">Too long — shorten the broker name. 名稱太長，請縮短經紀商名稱。</span>}
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-sm font-medium transition-colors">
              Cancel 取消
            </button>
            <button type="submit" disabled={saving || tooLong} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Submit for approval 提交審批
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
