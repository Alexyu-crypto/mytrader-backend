import { useEffect, useState } from 'react';
import { BadgeDollarSign, Check, ClipboardList, ExternalLink, History, KeyRound, Loader2, Trash2, UserRound, X } from 'lucide-react';
import { STAGES, approvalGaps, changeStage, deleteBroker, fetchLinks, stageMeta, type IbBroker, type IbStage } from '@/lib/ibPartners';
import { ApplicationTab } from '@/components/ib/ApplicationTab';
import { Hint, IconButton } from '@/components/IconButton';
import { RebateTab } from '@/components/ib/RebateTab';
import { AccessTab } from '@/components/ib/AccessTab';
import { ManagerTab } from '@/components/ib/ManagerTab';
import { TimelineTab } from '@/components/ib/TimelineTab';
import { ConfirmDialog } from '@/components/users/ConfirmDialog';
import { inputCls } from '@/components/ib/IbFields';

type Tab = 'application' | 'rebate' | 'access' | 'manager' | 'timeline';

const TABS: { key: Tab; label: string; icon: typeof ClipboardList }[] = [
  { key: 'application', label: 'Application 申請', icon: ClipboardList },
  { key: 'rebate', label: 'Rebate 回傭', icon: BadgeDollarSign },
  { key: 'access', label: 'Links & portal 連結後台', icon: KeyRound },
  { key: 'manager', label: 'IB manager IB 經理', icon: UserRound },
  { key: 'timeline', label: 'Timeline 時間線', icon: History },
];

const FLOW: IbStage[] = ['prospect', 'submitted', 'review', 'negotiating', 'approved'];

export function BrokerDrawer({ broker, isAdmin, onClose, onChanged }: { broker: IbBroker; isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('application');
  const [target, setTarget] = useState<IbStage | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [timelineKey, setTimelineKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !confirmDelete && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirmDelete]);

  const current = stageMeta(broker.stage);
  const flowIndex = FLOW.indexOf(broker.stage);

  const moveTo = async () => {
    if (!target) return;
    setBusy(true);
    setError('');
    if (target === 'approved') {
      const { links, error: linkErr } = await fetchLinks(broker.id);
      const gaps = linkErr ? [linkErr] : approvalGaps(broker, links);
      if (gaps.length) {
        setBusy(false);
        setError(`Before approving, please add: ${gaps.join('; ')}. 開通前請先補上以上資料。`);
        setTab('access');
        return;
      }
    }
    const err = await changeStage(broker, target, note);
    setBusy(false);
    if (err) return setError(err);
    setTarget(null);
    setNote('');
    setTimelineKey((k) => k + 1);
    onChanged();
  };

  const refresh = () => {
    setTimelineKey((k) => k + 1);
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-slate-800 bg-slate-900 shadow-2xl animate-fade-in">
        <header className="border-b border-slate-800 px-6 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${current.tone}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${current.dot}`} /> {current.label}
              </span>
              <h2 className="mt-2 truncate text-xl font-bold text-white">{broker.broker_name}</h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-slate-400">
                {[broker.regulation, broker.region].filter(Boolean).join(' · ') || 'No details yet 尚未填寫資料'}
                {/^https?:\/\//i.test(broker.website) && (
                  <Hint label="Open website · 開啟網站">
                    <a href={broker.website} target="_blank" rel="noopener noreferrer" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-cyan-300 hover:bg-slate-700/60 hover:text-cyan-200" aria-label="Open website">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Hint>
                )}
              </p>
            </div>
            {isAdmin && (
              <IconButton label="Delete · 刪除" tone="red" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            )}
            <IconButton label="Close · 關閉" tone="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <ol className="mt-5 flex items-center gap-1">
            {FLOW.map((s, i) => {
              const meta = stageMeta(s);
              const reached = flowIndex >= i;
              const isCurrent = broker.stage === s;
              return (
                <li key={s} className="flex flex-1 flex-col gap-1.5">
                  <button
                    onClick={() => !isCurrent && setTarget(s)}
                    disabled={isCurrent}
                    className={`h-1.5 rounded-full transition-colors ${reached ? 'bg-cyan-400' : 'bg-slate-700 hover:bg-slate-600'}`}
                    title={meta.label}
                  />
                  <span className={`hidden truncate text-[10px] sm:block ${isCurrent ? 'font-semibold text-cyan-300' : 'text-slate-500'}`}>{meta.label}</span>
                </li>
              );
            })}
          </ol>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Move to 轉到：</span>
            {STAGES.filter((s) => s.key !== broker.stage).map((s) => (
              <button
                key={s.key}
                onClick={() => setTarget(s.key)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${target === s.key ? s.tone : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {target && (
            <div className="mt-3 flex gap-2 animate-fade-in">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note 備註（可選）" className={inputCls} />
              <button onClick={moveTo} disabled={busy} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-500 px-3 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm 確認
              </button>
              <button onClick={() => { setTarget(null); setError(''); }} className="shrink-0 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
            </div>
          )}
          {error && <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error}</p>}
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-slate-800 px-4">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === key ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {tab === 'application' && <ApplicationTab key={broker.id} broker={broker} onSaved={refresh} />}
          {tab === 'rebate' && <RebateTab key={broker.id} broker={broker} onSaved={refresh} />}
          {tab === 'access' && <AccessTab key={broker.id} broker={broker} onSaved={refresh} />}
          {tab === 'manager' && <ManagerTab key={broker.id} broker={broker} onSaved={refresh} />}
          {tab === 'timeline' && <TimelineTab brokerId={broker.id} refreshKey={timelineKey} />}
        </div>
      </aside>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this broker file? 刪除此經紀商檔案？"
          message="All links, uploaded files, portal login, password and timeline for this broker will be removed permanently. 所有連結、已上載文件、後台帳號、密碼及時間線將永久刪除。"
          confirmLabel="Delete 刪除"
          onConfirm={async () => {
            const err = await deleteBroker(broker.id);
            if (!err) {
              onChanged();
              onClose();
            }
            return err;
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
