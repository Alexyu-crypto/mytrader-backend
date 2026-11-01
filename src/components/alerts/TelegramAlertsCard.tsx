import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Pause, Play, Plus, Send, Smartphone, Unplug } from 'lucide-react';
import { callTelegramAlerts, fetchTelegramStatus, type TelegramStatus } from '@/lib/telegramAlerts';
import { ConfirmDialog } from '@/components/users/ConfirmDialog';
import { IconButton } from '@/components/IconButton';

type Busy = '' | 'connect' | 'rescan' | 'test' | 'toggle';

function Steps() {
  return (
    <ol className="space-y-2 text-sm text-slate-300 leading-6 list-decimal list-inside">
      <li>
        In Telegram, search <span className="text-cyan-300 font-medium">@BotFather</span>, send <span className="font-mono text-white">/newbot</span> and follow the steps. 在 Telegram 搜尋 @BotFather，傳送 /newbot 建立機械人。
      </li>
      <li>BotFather replies with a token like <span className="font-mono text-slate-400">123456:ABC...</span>. Paste it below. 把收到的密碼貼在下面。</li>
      <li>Open your new bot and press <span className="text-white font-medium">Start</span>. To alert a team group, add the bot to the group and send any message. 開啟新機械人並按 Start；如要通知群組，把機械人加入群組並傳送任何訊息。</li>
      <li>Click Connect. 按「Connect」。</li>
    </ol>
  );
}

export function TelegramAlertsCard() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<Busy>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchTelegramStatus();
    if (res.status) {
      setStatus(res.status);
      setLoadError('');
    } else setLoadError(res.error ?? '');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (kind: Busy, body: Record<string, unknown>, success: (d: Record<string, unknown>) => string) => {
    setBusy(kind);
    setError('');
    setNotice('');
    const { data, error: err } = await callTelegramAlerts(body);
    setBusy('');
    if (err || !data) return setError(err ?? '');
    setNotice(success(data));
    setToken('');
    load();
  };

  const connect = () =>
    run('connect', { action: 'connect', token }, (d) => `Connected to @${d.bot_username}. A confirmation message was sent. 已連接，並已發送確認訊息。`);
  const rescan = () =>
    run('rescan', { action: 'connect' }, (d) => `Now alerting ${d.chats} chat(s). 現正通知 ${d.chats} 個對話。`);
  const test = () => run('test', { action: 'test' }, () => 'Test alert sent. Check Telegram. 測試警報已發送。');
  const toggle = () =>
    run('toggle', { action: 'set_enabled', enabled: !status?.enabled }, () => (status?.enabled ? 'Telegram alerts paused. 已暫停。' : 'Telegram alerts resumed. 已恢復。'));

  const isAdmin = status?.is_admin ?? false;
  const connected = status?.connected ?? false;

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className={`p-2.5 rounded-lg border ${connected && status?.enabled ? 'bg-sky-500/10 text-sky-300 border-sky-500/30' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>
          <Smartphone className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-[220px]">
          <h2 className="text-white font-semibold">Telegram Alerts · 手機即時警報</h2>
          <p className="text-slate-400 text-sm mt-0.5 leading-6">
            Sent from the server, so you get them even when this website is closed or your computer is off. Failed copies arrive within about 10 seconds, stuck copies within about 25 seconds.
            由伺服器發出，網站關閉或電腦關機都會收到。
          </p>
        </div>
        {connected && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status?.enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
            {status?.enabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
            {status?.enabled ? 'Active' : 'Paused'}
          </span>
        )}
      </div>

      <div className="mt-4">
        {!status && !loadError && (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking Telegram connection...
          </p>
        )}
        {loadError && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p className="text-red-300">{loadError}</p>
            <button onClick={load} className="text-cyan-400 hover:text-cyan-300 font-medium">Retry</button>
          </div>
        )}

        {status && connected && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Bot <span className="text-cyan-300 font-medium">@{status.bot_username}</span> · sending to <span className="text-white font-medium">{status.chats}</span> chat{status.chats === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-2">
              <IconButton label="Send test · 發送測試" tone="solid" size="md" onClick={test} disabled={!!busy}>
                {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </IconButton>
              {isAdmin && (
                <>
                  <IconButton label="Add phones / groups after they press Start · 加入手機 / 群組" size="md" onClick={rescan} disabled={!!busy}>
                    {busy === 'rescan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </IconButton>
                  <IconButton label={status.enabled ? 'Pause alerts · 暫停' : 'Resume alerts · 恢復'} tone={status.enabled ? 'amber' : 'green'} size="md" onClick={toggle} disabled={!!busy}>
                    {busy === 'toggle' ? <Loader2 className="w-4 h-4 animate-spin" /> : status.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </IconButton>
                  <IconButton label="Disconnect · 中斷連接" tone="red" size="md" onClick={() => setConfirmOff(true)} disabled={!!busy}>
                    <Unplug className="w-4 h-4" />
                  </IconButton>
                </>
              )}
            </div>
            {!isAdmin && <p className="text-xs text-slate-500">Only full admins can change these settings.</p>}
          </div>
        )}

        {status && !connected && (
          isAdmin ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <Steps />
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Bot token 機械人密碼</span>
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="123456789:AA..."
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </label>
                <button
                  onClick={connect}
                  disabled={!!busy || token.trim().length < 20}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {busy === 'connect' && <Loader2 className="w-4 h-4 animate-spin" />} Connect
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Not connected. Ask a full admin to connect Telegram here. 尚未連接，請全權管理員設定。</p>
          )
        )}

        {error && <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300 leading-6">{error}</p>}
        {notice && <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</p>}
      </div>

      {confirmOff && (
        <ConfirmDialog
          title="Disconnect Telegram? 中斷 Telegram？"
          message="No more phone alerts will be sent until you connect again. 中斷後將不再發送手機警報。"
          confirmLabel="Disconnect"
          onClose={() => setConfirmOff(false)}
          onConfirm={async () => {
            const { error: err } = await callTelegramAlerts({ action: 'disconnect' });
            if (!err) {
              setNotice('Telegram disconnected. 已中斷。');
              load();
            }
            return err;
          }}
        />
      )}
    </section>
  );
}
