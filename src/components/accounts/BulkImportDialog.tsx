import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, FileDown, Loader2, Upload, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { connectMetaApi } from '@/lib/metaapi';
import { supabase } from '@/lib/supabase';
import { downloadImportTemplate, parseAccountsCsv, type ImportRow } from '@/lib/accountImport';
import { saveAccountPasswords } from '@/lib/accountCredentials';

const CHUNK = 100;

interface Result {
  created: number;
  failed: { line: number; name: string; reason: string }[];
  passwordFailed: number;
  linked: number;
  linkFailed: number;
  cloudStarted: number;
  cloudFailed: { name: string; reason: string }[];
}

export function BulkImportDialog({
  existingNames,
  existingMasters,
  onClose,
  onDone,
}: {
  existingNames: Set<string>;
  existingMasters: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.length - valid.length;

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name) || file.size > 1_000_000) {
      setRows([]);
      setFileError('Please choose a CSV file under 1 MB. 請選擇 1MB 以內的 CSV 檔案。');
      return;
    }
    const parsed = parseAccountsCsv(await file.text(), existingNames, existingMasters);
    setRows(parsed.rows);
    setFileError(parsed.error ?? '');
  };

  const runImport = async () => {
    setImporting(true);
    setProgress('');
    const failed: Result['failed'] = [];
    let created = 0;
    const saved: { id: string; account_name: string }[] = [];
    const toPayload = (r: ImportRow) => ({ account_name: r.account_name, broker: r.broker, broker_server: r.broker_server, platform: r.platform, type: r.type, connection_method: r.connection_method, holder_name: r.holder_name });
    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK);
      const { data, error } = await supabase.from('accounts').insert(chunk.map(toPayload)).select('id, account_name');
      if (!error) {
        created += chunk.length;
        saved.push(...(data ?? []));
        continue;
      }
      for (const r of chunk) {
        const { data: one, error: rowErr } = await supabase.from('accounts').insert(toPayload(r)).select('id, account_name').maybeSingle();
        if (rowErr) failed.push({ line: r.line, name: r.account_name, reason: rowErr.code === '23505' ? 'Already exists' : 'Could not be saved' });
        else {
          created++;
          if (one) saved.push(one);
        }
      }
    }
    const passwordByName = new Map(valid.filter((r) => r.password).map((r) => [r.account_name, r.password as string]));
    const passwordRows = saved.filter((s) => passwordByName.has(s.account_name)).map((s) => ({ account_id: s.id, password: passwordByName.get(s.account_name) as string }));
    const passwordsOk = await saveAccountPasswords(passwordRows);

    const savedNames = new Set(saved.map((s) => s.account_name));
    const pairs = valid
      .filter((r) => r.master_account && savedNames.has(r.account_name) && (existingMasters.has(r.master_account) || savedNames.has(r.master_account)))
      .map((r) => ({ master_account: r.master_account as string, follower_account: r.account_name, ...r.pair_values }));
    const wantedPairs = valid.filter((r) => r.master_account && savedNames.has(r.account_name)).length;
    let linked = 0;
    for (let i = 0; i < pairs.length; i += CHUNK) {
      const chunk = pairs.slice(i, i + CHUNK);
      const { error } = await supabase.from('copy_settings').insert(chunk);
      if (!error) {
        linked += chunk.length;
        continue;
      }
      for (const p of chunk) {
        const { error: pairErr } = await supabase.from('copy_settings').insert(p);
        if (!pairErr) linked++;
      }
    }

    const cloudNames = new Set(valid.filter((r) => r.connection_method === 'metaapi').map((r) => r.account_name));
    const cloudRows = passwordsOk ? saved.filter((s) => cloudNames.has(s.account_name)) : [];
    const cloudFailed: Result['cloudFailed'] = passwordsOk
      ? []
      : saved.filter((s) => cloudNames.has(s.account_name)).map((s) => ({ name: s.account_name, reason: 'Password not saved' }));
    let cloudStarted = 0;
    for (let i = 0; i < cloudRows.length; i++) {
      setProgress(`Connecting MetaApi cloud 連接雲端 ${i + 1}/${cloudRows.length}`);
      const { error } = await connectMetaApi(cloudRows[i].id);
      if (error) cloudFailed.push({ name: cloudRows[i].account_name, reason: error });
      else cloudStarted++;
    }

    setImporting(false);
    setProgress('');
    setResult({ created, failed, passwordFailed: passwordsOk ? 0 : passwordRows.length, linked, linkFailed: wantedPairs - linked, cloudStarted, cloudFailed });
    if (created > 0) onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-slate-800">
        <header className="flex items-start justify-between gap-4 border-b border-slate-700 p-6">
          <div>
            <h2 className="text-xl font-bold text-white">Bulk Import Accounts · 批量開戶</h2>
            <p className="mt-1 text-sm text-slate-400">Upload a CSV to create many MT4/MT5 accounts at once. 上載 CSV 一次過新增多個帳戶。</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
                <p className="text-sm text-emerald-200">
                  {result.created} account{result.created === 1 ? '' : 's'} created. 已成功新增 {result.created} 個帳戶。
                </p>
              </div>
              {result.failed.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                  <p className="mb-2 font-medium">{result.failed.length} could not be created 未能新增:</p>
                  <ul className="space-y-1 font-mono text-xs">
                    {result.failed.map((f) => (
                      <li key={f.line}>Row {f.line} · {f.name} — {f.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.linked > 0 && (
                <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">
                  {result.linked} follower(s) linked to their master with the copy settings from the file. 已有 {result.linked} 個跟單帳戶連結主帳戶，並套用檔案內的跟單設定。
                </p>
              )}
              {result.linkFailed > 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  {result.linkFailed} follower(s) could not be linked to a master. Please add the pair on the Copy Settings page. {result.linkFailed} 個跟單帳戶未能連結主帳戶，請到跟單設定頁手動加入。
                </p>
              )}
              {result.cloudStarted > 0 && (
                <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-200">
                  {result.cloudStarted} MetaApi cloud account(s) are being deployed and will be online in 1-2 minutes. {result.cloudStarted} 個 MetaApi 雲端帳戶正在啟動，約 1-2 分鐘後上線。
                </p>
              )}
              {result.cloudFailed.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  <p className="mb-1">{result.cloudFailed.length} MetaApi account(s) could not connect. Retry from the MetaApi Monitor page. {result.cloudFailed.length} 個雲端帳戶未能連線，請到「Meta API 監察」頁重試。</p>
                  <ul className="space-y-1 font-mono text-xs">
                    {result.cloudFailed.map((f) => (
                      <li key={f.name}>{f.name} — {f.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.passwordFailed > 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  {result.passwordFailed} password(s) could not be saved. Please add them by editing each account. {result.passwordFailed} 個密碼未能儲存，請逐一編輯帳戶補上。
                </p>
              )}
              <p className="text-xs text-slate-500">EA accounts: download each account's EA from the accounts list to connect it. EA 帳戶請於帳戶列表下載 EA 進行連接。</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm">
                <div className="text-slate-400">
                  <p>Columns 欄位: <span className="font-mono text-xs text-slate-300">holder_name, account_number, broker, broker_server, platform, type, connection, password, master_account</span></p>
                  <p className="mt-1 text-xs text-slate-500"><span className="font-mono">connection</span>: <span className="font-mono">ea</span> (default) or <span className="font-mono">metaapi</span>. MetaApi rows need the exact <span className="font-mono">broker_server</span> and trading password, and connect to the cloud automatically. 填 metaapi 須提供準確伺服器名同交易密碼，匯入後自動連接雲端。</p>
                  <p className="mt-1 text-xs text-slate-500">Or fill <span className="font-mono">account_name</span> directly (e.g. a file from Export). Type: master / follower.</p>
                  <p className="mt-1 text-xs text-slate-500"><span className="font-mono">master_account</span> (optional, followers only): the master's full account name, existing or in this file. 選填，填主帳戶完整名稱即自動配對跟單。</p>
                  <p className="mt-1 text-xs text-slate-500">Copy settings (optional): <span className="font-mono">enabled, mode, lot_multiplier, fixed_lot, min_lot, max_lot, reverse, copy_sl, copy_tp, copy_pending_orders, max_open_trades, allowed_symbols, blocked_symbols</span>. Blank = default. 跟單設定選填，留空用預設值。</p>
                </div>
                <IconButton label="Download template · 下載範本" size="md" onClick={downloadImportTemplate}>
                  <FileDown className="h-4 w-4" />
                </IconButton>
              </div>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  loadFile(e.dataTransfer.files[0]);
                }}
                className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors ${dragging ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-600 hover:border-cyan-500/60'}`}
              >
                {fileName ? <FileSpreadsheet className="h-8 w-8 text-cyan-400" /> : <Upload className="h-8 w-8 text-slate-500" />}
                <span className="text-sm font-medium text-white">{fileName || 'Choose or drop a CSV file 選擇或拖放 CSV 檔案'}</span>
                {fileName && <span className="text-xs text-slate-500">Click to choose another file 點擊更換檔案</span>}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  loadFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />

              {fileError && (
                <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {fileError}
                </p>
              )}

              {rows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex gap-4 text-sm">
                    <span className="text-emerald-400">{valid.length} ready 可新增</span>
                    {invalid > 0 && <span className="text-red-400">{invalid} with problems 有問題 (will be skipped 將略過)</span>}
                  </div>
                  <div className="max-h-72 overflow-auto rounded-lg border border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900 text-slate-400">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Row</th>
                          <th className="px-3 py-2 text-left font-medium">Account Name</th>
                          <th className="px-3 py-2 text-left font-medium">Broker / Server</th>
                          <th className="px-3 py-2 text-left font-medium">Platform</th>
                          <th className="px-3 py-2 text-left font-medium">Type</th>
                          <th className="px-3 py-2 text-left font-medium">Connection</th>
                          <th className="px-3 py-2 text-left font-medium">Follows 跟隨</th>
                          <th className="px-3 py-2 text-left font-medium">Password</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.line} className={`border-t border-slate-700/50 ${r.error ? 'bg-red-500/5' : ''}`}>
                            <td className="px-3 py-2 text-slate-500">{r.line}</td>
                            <td className="px-3 py-2 font-mono text-white">{r.account_name || '—'}</td>
                            <td className="px-3 py-2 text-slate-300">
                              {r.broker || '—'}
                              {r.broker_server && <span className="block font-mono text-slate-500">{r.broker_server}</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-300">{r.platform}</td>
                            <td className="px-3 py-2 capitalize text-slate-300">{r.type}</td>
                            <td className="px-3 py-2"><ConnectionBadge method={r.connection_method} /></td>
                            <td className="px-3 py-2 font-mono text-cyan-300">
                              {r.master_account || <span className="text-slate-600">—</span>}
                              {r.master_account && (
                                <span className="block font-sans capitalize text-slate-500">
                                  {[
                                    r.pair_values.enabled ? 'on' : 'off',
                                    `${r.pair_values.mode} ${r.pair_values.mode === 'fixed' ? `${r.pair_values.fixed_lot} lot` : `${r.pair_values.lot_multiplier}x`}`,
                                    r.pair_values.reverse ? 'reverse' : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-500">{r.password ? '••••••' : '—'}</td>
                            <td className="px-3 py-2">{r.error ? <span className="text-red-400">{r.error}</span> : <span className="text-emerald-400">Ready</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-700 p-4">
          {progress && <span className="mr-auto text-xs text-sky-300">{progress}</span>}
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white">
            {result ? 'Done 完成' : 'Cancel 取消'}
          </button>
          {!result && (
            <button
              onClick={runImport}
              disabled={valid.length === 0 || importing}
              className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-600 disabled:opacity-40"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import {valid.length} account{valid.length === 1 ? '' : 's'} 新增
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
