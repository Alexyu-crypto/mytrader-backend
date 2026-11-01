import { Download, Eye, FileSpreadsheet, Globe, Layers, Lock, Pencil, Plus, Upload } from 'lucide-react';
import { Marker, PreviewFrame } from '@/components/manual/PreviewFrame';
import { Field } from '@/components/manual/AppPreviews';

function Label({ text, n }: { text: string; n?: number }) {
  return (
    <span className="flex items-center gap-1.5 text-slate-400 text-xs font-medium mb-1">
      {text} {n !== undefined && <Marker n={n} />}
    </span>
  );
}

export function AddAccountPreview() {
  return (
    <PreviewFrame
      caption="圖：Accounts 頁的「Add New Account」表格（資料只作示範）。"
      legend={['選擇主帳戶或跟單帳戶，建立後不可更改', '持有人名稱、帳號和經紀商', 'IP 會由 EA 自動偵測，密碼只有管理員和交易員看到', '自動產生的帳戶名稱，必須和 EA 的 AccountLabel 一樣']}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <div>
          <Label text="Account Type (Role)" n={1} />
          <div className="grid grid-cols-2 gap-2">
            <span className="py-2 rounded-lg text-sm font-medium text-center bg-cyan-500 text-white">M Master</span>
            <span className="py-2 rounded-lg text-sm font-medium text-center bg-slate-900 text-slate-400">F Follower</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label text="Account Holder Name" n={2} /><Field value="John Chan" /></div>
          <div><Label text="MT4/MT5 Account Number" /><Field value="80745" /></div>
          <div><Label text="Broker" /><Field value="9XMarkets" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label text="VPS / IP Address (optional)" n={3} /><Field value="Auto-detected" /></div>
          <div>
            <Label text="Password 密碼 (optional)" />
            <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
              •••••••• <Eye className="w-4 h-4 text-slate-500" />
            </div>
          </div>
        </div>
        <div>
          <Label text="Generated Account Name (auto)" n={4} />
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2 font-mono text-sm text-cyan-300">M-J-80745-9XMarkets</div>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function AccountsToolbarPreview() {
  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium';
  return (
    <PreviewFrame
      caption="圖：Accounts 頁頂部的按鈕，以及帳戶列表中的一行。"
      legend={['匯出所有帳戶', '用 CSV 檔一次過新增多個帳戶', '新增單一帳戶', '報告公開或只限成員', '下載專屬 EA、設定指南、修改']}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${btn} bg-slate-800 border border-slate-700 text-slate-200`}><FileSpreadsheet className="w-3.5 h-3.5" /> Export 匯出</span>
          <Marker n={1} />
          <span className={`${btn} bg-slate-800 border border-slate-700 text-slate-200`}><Upload className="w-3.5 h-3.5" /> Import 批量開戶</span>
          <Marker n={2} />
          <span className={`${btn} bg-cyan-500 text-white`}><Plus className="w-3.5 h-3.5" /> Add New Account</span>
          <Marker n={3} />
        </div>
        <div className="grid grid-cols-[1.6fr_1fr_0.8fr_1.2fr_auto] items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2.5 text-xs">
          <span className="font-mono text-cyan-400 truncate">M-J-80745-9XMarkets</span>
          <span className="font-mono text-slate-300">42.2.9.53 <span className="ml-1 text-[9px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-1">AUTO</span></span>
          <span className="inline-flex items-center gap-1 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Online</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-slate-300 border border-slate-600 rounded-md px-2 py-0.5"><Lock className="w-3 h-3" /> Members · 限成員</span>
            <Marker n={4} />
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <Download className="w-3.5 h-3.5" /> <span>Setup</span> <Pencil className="w-3.5 h-3.5" />
            <Marker n={5} />
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Globe className="w-3 h-3" /> Public · 公開 = 任何人有連結都可以看報告</p>
      </div>
    </PreviewFrame>
  );
}

export function CopyGroupPreview() {
  return (
    <PreviewFrame
      caption="圖：Copy Groups · 跟單組別 頁面的一個組別（名稱只作示範）。"
      legend={['組別名稱，可按 Rename 修改', '主帳戶和跟隨中的帳戶數量', '加入新的跟單帳戶', '每個跟單帳戶的設定摘要，按 Edit 修改']}
    >
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden text-xs">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-white font-semibold text-sm">Flying Tigers · 飛虎隊</span>
          <Marker n={1} />
          <span className="text-slate-500 ml-2 font-mono">M-J-80745-9X</span>
          <span className="text-slate-400">· 3 followers · 2 on</span>
          <Marker n={2} />
          <span className="ml-auto inline-flex items-center gap-1 text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 rounded-md px-2 py-1">
            <Plus className="w-3 h-3" /> Add follower
          </span>
          <Marker n={3} />
        </div>
        {[
          ['F-KC-1021-Windsor', true, 'x1.5', 'XAUUSD → GOLD'],
          ['F-AL-5520-EGlobal', true, '0.10 lot', 'Same names'],
          ['F-Demo-2', false, 'x0.5', 'Suffix .m'],
        ].map(([f, on, lot, map], i) => (
          <div key={f as string} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1.2fr_auto] items-center gap-2 px-4 py-2 border-b border-slate-700/50 last:border-0">
            <span className="font-mono text-amber-400 truncate">{f}</span>
            <span className={on ? 'text-emerald-400' : 'text-red-400'}>{on ? 'Enabled' : 'Disabled'}</span>
            <span className="text-slate-300">{lot}</span>
            <span className="text-slate-400 truncate">{map}</span>
            <span className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded bg-slate-700 text-white">Edit</span>
              {i === 0 && <Marker n={4} />}
            </span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}
