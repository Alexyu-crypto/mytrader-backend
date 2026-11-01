import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileDown, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Account, CopySettings } from '@/lib/types';
import { downloadPairWorkbook, parsePairTable, readPairFile, type PairRow } from '@/lib/copyGroupImport';
import { IconButton } from '@/components/IconButton';

const CHUNK = 100;

interface Result {
  saved: number;
  failed: { line: number; pair: string }[];
  groupsFailed: boolean;
}

export function CopyGroupImportDialog({
  accounts,
  settings,
  groupNames,
  onClose,
  onDone,
}: {
  accounts: Account[];
  settings: CopySettings[];
  groupNames: Map<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PairRow[]>([]);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const valid = rows.filter((r) => !r.error);
  const updates = valid.filter((r) => r.isUpdate).length;
  const invalid = rows.length - valid.length;

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    setRows([]);
    if (!/\.(xlsx|csv)$/i.test(file.name) || file.size > 5_000_000) {
      setFileError('Please choose an Excel (.xlsx) or CSV file under 5 MB. 請選擇 5MB 以內的 Excel (.xlsx) 或 CSV 檔案。');
      return;
    }
    try {
      const parsed = parsePairTable(await readPairFile(file), accounts, settings);
      setRows(parsed.rows);
      setFileError(parsed.error ?? '');
    } catch {
      setFileError('Could not read this file. Please save it as .xlsx in Excel and try again. 無法讀取檔案，請在 Excel 另存為 .xlsx 再試。');
    }
  };

  const runImport = async () => {
    setImporting(true);
    const failed: Result['failed'] = [];
    let saved = 0;
    const toPayload = (r: PairRow) => ({ master_account: r.master_account, follower_account: r.follower_account, ...r.values });
    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK);
      const { error } = await supabase.from('copy_settings').upsert(chunk.map(toPayload), { onConflict: 'master_account,follower_account' });
      if (!error) {
        saved += chunk.length;
        continue;
      }
      for (const r of chunk) {
        const { error: rowErr } = await supabase.from('copy_settings').upsert(toPayload(r), { onConflict: 'master_account,follower_account' });
        if (rowErr) failed.push({ line: r.line, pair: `${r.master_account} → ${r.follower_account}` });
        else saved++;
      }
    }

    const names = new Map<string, string>();
    for (const r of valid) if (r.group_name && !names.has(r.master_account)) names.set(r.master_account, r.group_name);
    const changed = [...names].filter(([master, name]) => groupNames.get(master) !== name);
    let groupsFailed = false;
    if (changed.length) {
      const now = new Date().toISOString();
      const { error } = await supabase.from('copy_groups').upsert(changed.map(([master_account, name]) => ({ master_account, name, updated_at: now })));
      groupsFailed = !!error;
    }

    setImporting(false);
    setResult({ saved, failed, groupsFailed });
    if (saved > 0 || changed.length) onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-700 bg-slate-800 animate-pop-in">
        <header className="flex items-start justify-between gap-4 border-b border-slate-700 p-6">
          <div>
            <h2 className="text-xl font-bold text-white">Import Copy Groups · 匯入跟單組別</h2>
            <p className="mt-1 text-sm text-slate-400">Upload an Excel file to set up many master → follower pairs at once. 上載 Excel 一次過設定所有跟單配對。</p>
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
                  {result.saved} pair{result.saved === 1 ? '' : 's'} saved. 已成功儲存 {result.saved} 個跟單配對。
                </p>
              </div>
              {result.failed.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                  <p className="mb-2 font-medium">{result.failed.length} could not be saved 未能儲存:</p>
                  <ul className="space-y-1 font-mono text-xs">
                    {result.failed.map((f) => (
                      <li key={f.line}>Row {f.line} · {f.pair}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.groupsFailed && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Group names could not be saved. You can rename the groups on the page. 組別名稱未能儲存，請在頁面上逐一命名。
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm">
                <div className="max-w-xl text-slate-400">
                  <p>
                    Download the Excel file, edit it, then upload it here. {settings.length > 0 ? 'It already contains your current pairs.' : 'It contains example rows using your accounts.'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    下載 Excel，修改後再上載。已有配對會更新，新配對會新增，不會刪除任何配對。Existing pairs are updated, new ones added, nothing is deleted.
                  </p>
                </div>
                <IconButton label="Download Excel · 下載" tone="primary" size="md" onClick={() => downloadPairWorkbook(settings, groupNames, accounts)}>
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
                <span className="text-sm font-medium text-white">{fileName || 'Choose or drop an Excel file 選擇或拖放 Excel 檔案'}</span>
                <span className="text-xs text-slate-500">{fileName ? 'Click to choose another file 點擊更換檔案' : '.xlsx or .csv'}</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
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
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="text-emerald-400">{valid.length - updates} new 新增</span>
                    <span className="text-sky-400">{updates} update 更新</span>
                    {invalid > 0 && <span className="text-red-400">{invalid} with problems 有問題 (will be skipped 將略過)</span>}
                  </div>
                  <div className="max-h-80 overflow-auto rounded-lg border border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900 text-slate-400">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Row</th>
                          <th className="px-3 py-2 text-left font-medium">Group</th>
                          <th className="px-3 py-2 text-left font-medium">Master → Follower</th>
                          <th className="px-3 py-2 text-left font-medium">Lots</th>
                          <th className="px-3 py-2 text-left font-medium">Options</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.line} className={`border-t border-slate-700/50 ${r.error ? 'bg-red-500/5' : ''}`}>
                            <td className="px-3 py-2 text-slate-500">{r.line}</td>
                            <td className="px-3 py-2 text-slate-300">{r.group_name || <span className="text-slate-600">—</span>}</td>
                            <td className="px-3 py-2 font-mono">
                              <span className="text-cyan-400">{r.master_account || '—'}</span>
                              <span className="block text-amber-400">→ {r.follower_account || '—'}</span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-300">
                              {r.values.mode === 'fixed' ? `${r.values.fixed_lot} lot` : `${r.values.mode === 'ratio' ? 'ratio ' : ''}x${r.values.lot_multiplier}`}
                              <span className="block text-slate-500">max {r.values.max_lot}</span>
                            </td>
                            <td className="px-3 py-2 text-slate-400">
                              {[
                                !r.values.enabled && 'Disabled',
                                r.values.reverse && 'Reverse',
                                !r.values.copy_sl && 'No SL',
                                !r.values.copy_tp && 'No TP',
                                r.values.max_open_trades > 0 && `Max ${r.values.max_open_trades}`,
                                r.values.allowed_symbols.length > 0 && `Allow ${r.values.allowed_symbols.join(',')}`,
                                r.values.blocked_symbols.length > 0 && `Block ${r.values.blocked_symbols.join(',')}`,
                              ]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.error ? (
                                <span className="text-red-400">{r.error}</span>
                              ) : r.isUpdate ? (
                                <span className="text-sky-400">Update 更新</span>
                              ) : (
                                <span className="text-emerald-400">New 新增</span>
                              )}
                            </td>
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

        <footer className="flex justify-end gap-3 border-t border-slate-700 p-4">
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
              Import {valid.length} pair{valid.length === 1 ? '' : 's'} 匯入
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
