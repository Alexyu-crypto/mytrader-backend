import { useEffect, useState } from 'react';
import { AlertTriangle, Archive, CheckCircle2, FileSpreadsheet, Loader2, ShieldAlert, ShieldCheck, UserRound, X } from 'lucide-react';
import type { Account, AccountSnapshot, ArchiveStatus } from '@/lib/types';
import { ARCHIVE_STATUSES, MARKED_STATUSES, MAX_FROZEN_REASON, MAX_HOLDER_NAME, downloadAccountEvidence, fetchSnapshots, setArchiveStatus, setHolderName } from '@/lib/accountArchive';
import { formatCurrency, formatTime, timeAgo } from '@/lib/format';
import { IconButton } from '@/components/IconButton';
import { useConfirm } from '@/hooks/useConfirm';

function Stat({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export function AccountArchiveDialog({ account, canEdit, onClose, onChanged }: { account: Account; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const ask = useConfirm();
  const [snapshots, setSnapshots] = useState<AccountSnapshot[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reason, setReason] = useState(account.frozen_reason ?? '');
  const [holder, setHolder] = useState(account.holder_name ?? '');
  const [savedHolder, setSavedHolder] = useState(account.holder_name ?? '');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSnapshots(account.account_name).then((rows) => {
      if (cancelled) return;
      if (rows) setSnapshots(rows);
      else setLoadError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [account.account_name]);

  const latest = snapshots?.[0];
  const lastConnectedDay = snapshots?.find((s) => s.connected)?.snapshot_date;

  const changeStatus = async (next: ArchiveStatus) => {
    if (next === 'active' && !(await ask(`Set "${account.account_name}" back to normal? 確定恢復正常？`, { tone: 'info', title: 'Restore account · 恢復帳戶', confirmLabel: 'Restore · 恢復' }))) return;
    setSaving(true);
    setMessage(null);
    const ok = await setArchiveStatus(account, next, reason);
    setSaving(false);
    if (!ok) {
      setMessage({ ok: false, text: 'Could not update the status. Please try again. 未能更新狀態，請再試。' });
      return;
    }
    setMessage({
      ok: true,
      text: next === 'active' ? 'Set back to normal. 已恢復正常。' : `Marked as ${ARCHIVE_STATUSES[next].label}. This account can no longer be deleted. 帳戶不能被刪除。`,
    });
    onChanged();
  };

  const saveNote = async () => {
    setSaving(true);
    setMessage(null);
    const ok = await setArchiveStatus(account, account.archive_status, reason);
    setSaving(false);
    setMessage(ok ? { ok: true, text: 'Note saved. 備註已儲存。' } : { ok: false, text: 'Could not save the note. 未能儲存備註。' });
    if (ok) onChanged();
  };

  const saveHolder = async () => {
    setSaving(true);
    setMessage(null);
    const ok = await setHolderName(account, holder);
    setSaving(false);
    if (!ok) {
      setMessage({ ok: false, text: 'Could not save the holder name. 未能儲存戶口持有人。' });
      return;
    }
    setSavedHolder(holder.trim());
    setHolder(holder.trim());
    setMessage({ ok: true, text: 'Holder name saved. 戶口持有人已儲存。' });
    onChanged();
  };

  const download = async () => {
    setDownloading(true);
    setMessage(null);
    const ok = await downloadAccountEvidence({ ...account, holder_name: savedHolder || null });
    setDownloading(false);
    if (!ok) setMessage({ ok: false, text: 'Could not prepare the file. Please try again. 未能產生檔案，請再試。' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-700 px-6 py-4">
          <div className="min-w-0">
            <h2 id="archive-title" className="flex items-center gap-2 text-lg font-bold text-white">
              <Archive className="h-5 w-5 text-cyan-400" />
              Account Archive 帳戶存檔
            </h2>
            <p className="mt-0.5 truncate font-mono text-sm text-slate-400">{account.account_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 transition-colors hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <div className={`rounded-lg border p-4 ${ARCHIVE_STATUSES[account.archive_status].card}`}>
            <div className="flex items-center gap-3">
              {account.frozen ? <ShieldAlert className={`h-6 w-6 shrink-0 ${ARCHIVE_STATUSES[account.archive_status].icon}`} /> : <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-400" />}
              <div>
                <p className="text-sm font-semibold text-white">{ARCHIVE_STATUSES[account.archive_status].label}</p>
                <p className="text-xs text-slate-400">
                  {account.frozen
                    ? `Since ${formatTime(account.frozen_at)}. ${ARCHIVE_STATUSES[account.archive_status].hint} Records are protected and the account cannot be deleted. 紀錄受保護，不能刪除。`
                    : 'Mark the account if the broker disabled it, it was removed from the VM, or it is no longer used. 經紀停用、已從VM移除或停用時請標記。'}
                </p>
              </div>
            </div>
            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                {MARKED_STATUSES.filter((s) => s !== account.archive_status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => changeStatus(s)}
                    disabled={saving}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${ARCHIVE_STATUSES[s].button}`}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {s === 'frozen'
                      ? 'Mark frozen 標記凍結'
                      : s === 'removed_vm'
                        ? account.connection_method === 'metaapi'
                          ? 'Removed from Cloud 已從雲端移除'
                          : 'Removed from VM 已從VM移除'
                        : 'Stop use AC 停用帳戶'}
                  </button>
                ))}
                {account.frozen && (
                  <button
                    type="button"
                    onClick={() => changeStatus('active')}
                    disabled={saving}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${ARCHIVE_STATUSES.active.button}`}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Back to normal 恢復正常
                  </button>
                )}
              </div>
            )}
            {canEdit ? (
              <div className="mt-3">
                <label htmlFor="frozen-reason" className="mb-1 block text-xs font-medium text-slate-400">
                  Case note 個案備註 <span className="text-slate-600">(optional)</span>
                </label>
                <textarea
                  id="frozen-reason"
                  value={reason}
                  maxLength={MAX_FROZEN_REASON}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Broker disabled the account on 12 Oct, complaint ref #12345"
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-cyan-500 focus:outline-none"
                />
                {account.frozen && reason.trim() !== (account.frozen_reason ?? '') && (
                  <button type="button" onClick={saveNote} disabled={saving} className="mt-1 text-xs font-medium text-cyan-400 transition-colors hover:text-cyan-300 disabled:opacity-50">
                    Save note 儲存備註
                  </button>
                )}
              </div>
            ) : (
              account.frozen_reason && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{account.frozen_reason}</p>
            )}
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-700 bg-slate-900/40 p-4 sm:grid-cols-2">
            <div>
              <label htmlFor="holder-name" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <UserRound className="h-3.5 w-3.5" />
                AC holder name 戶口持有人
              </label>
              {canEdit ? (
                <div className="flex gap-2">
                  <input
                    id="holder-name"
                    value={holder}
                    maxLength={MAX_HOLDER_NAME}
                    onChange={(e) => setHolder(e.target.value)}
                    placeholder="e.g. Chan Tai Man"
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-600 transition-colors focus:border-cyan-500 focus:outline-none"
                  />
                  {holder.trim() !== savedHolder && (
                    <button type="button" onClick={saveHolder} disabled={saving} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-cyan-400 disabled:opacity-50">
                      Save 儲存
                    </button>
                  )}
                </div>
              ) : (
                <p className="py-2 text-sm text-white">{savedHolder || <span className="text-slate-500">Not entered 未登記</span>}</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Name in MT 平台戶名 <span className="text-slate-600">(from EA)</span></p>
              <p className="py-2 text-sm text-white">
                {account.mt_holder_name || <span className="text-slate-500">Not reported yet 尚未回報</span>}
              </p>
              {account.mt_holder_at && <p className="text-[11px] text-slate-500">Reported {timeAgo(account.mt_holder_at)}</p>}
              {account.mt_holder_name && savedHolder && account.mt_holder_name.trim().toLowerCase() !== savedHolder.toLowerCase() && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> Names differ 名稱不一致
                </p>
              )}
            </div>
          </div>

          {message && (
            <p className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
              {message.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              {message.text}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Last balance 結餘" value={formatCurrency(latest?.balance ?? account.balance ?? 0)} />
            <Stat label="Last equity 淨值" value={formatCurrency(latest?.equity ?? account.equity ?? 0)} />
            <Stat label="Deposits 總入金" value={formatCurrency(latest?.total_deposits ?? 0)} tone="text-emerald-400" />
            <Stat label="Withdrawals 總出金" value={formatCurrency(latest?.total_withdrawals ?? 0)} tone="text-amber-400" />
          </div>
          <p className="text-xs text-slate-500">
            EA last connected 最後連線: <span className="text-slate-300">{account.last_seen ? `${formatTime(account.last_seen)} (${timeAgo(account.last_seen)})` : 'never 從未'}</span>
            {lastConnectedDay && <> · last connected day 最後連線日: <span className="text-slate-300">{lastConnectedDay}</span></>}
          </p>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Daily records 每日紀錄</h3>
              <span className="text-xs text-slate-500">Saved automatically every hour 每小時自動儲存</span>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-700">
              {loadError ? (
                <p className="px-4 py-6 text-center text-sm text-red-300">Could not load daily records. 未能載入每日紀錄。</p>
              ) : !snapshots ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                </div>
              ) : snapshots.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No daily records yet. The first one is saved within the hour. 尚未有紀錄，一小時內會自動儲存。</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 text-xs text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Date 日期</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                      <th className="px-3 py-2 text-right font-medium">Equity</th>
                      <th className="px-3 py-2 text-right font-medium">Deposits</th>
                      <th className="px-3 py-2 text-right font-medium">Withdrawals</th>
                      <th className="px-3 py-2 text-center font-medium">EA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr key={s.id} className="border-t border-slate-700/50 font-mono text-xs">
                        <td className="px-3 py-2 text-slate-300">{s.snapshot_date}</td>
                        <td className="px-3 py-2 text-right text-white">{formatCurrency(s.balance)}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{formatCurrency(s.equity)}</td>
                        <td className="px-3 py-2 text-right text-emerald-400">{formatCurrency(s.total_deposits)}</td>
                        <td className="px-3 py-2 text-right text-amber-400">{formatCurrency(s.total_withdrawals)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block h-2 w-2 rounded-full ${s.connected ? 'bg-emerald-400' : 'bg-red-400'}`} title={s.connected ? 'Connected 已連線' : 'Not connected 未連線'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-700 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Excel includes summary, daily balance, all funding and closed trades. 包括摘要、每日結餘、出入金及交易紀錄。</p>
          <IconButton label={downloading ? 'Preparing... · 準備中' : 'Download evidence · 下載證明檔案'} tone="solid" size="md" onClick={download} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
