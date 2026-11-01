import { ChevronRight, File, Folder, Smile } from 'lucide-react';
import { Marker, PreviewFrame } from '@/components/manual/PreviewFrame';

const MT_NOTE = '（按 MT4 英文介面重現，中文介面位置相同）';

function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-100 text-slate-800 rounded-md border border-slate-400 shadow-lg overflow-hidden text-xs">
      <div className="flex items-center justify-between bg-white border-b border-slate-300 px-3 py-1.5">
        <span className="font-semibold">{title}</span>
        <span className="text-slate-500">✕</span>
      </div>
      {children}
    </div>
  );
}

function Check({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center text-[10px] leading-none ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-400'}`}>
        {on ? '✓' : ''}
      </span>
      <span>{label}</span>
    </div>
  );
}

function WinButton({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <span className={`px-4 py-1 rounded border ${primary ? 'border-blue-600 bg-blue-50' : 'border-slate-400 bg-white'}`}>{label}</span>
  );
}

export function DataFolderPreview() {
  return (
    <PreviewFrame
      caption={`圖：開啟資料資料夾、放入 EA、重新整理導航器${MT_NOTE}。`}
      legend={['File → Open Data Folder（檔案 → 開啟資料資料夾）', '放進 MQL4 → Experts 資料夾', '導航器 Expert Advisors 按右鍵 → Refresh']}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-3">
          <div className="bg-slate-100 text-slate-800 rounded-md border border-slate-400 text-xs overflow-hidden">
            <div className="flex gap-4 bg-white border-b border-slate-300 px-3 py-1.5">
              <span className="bg-blue-100 px-1 rounded">File</span>
              <span>View</span>
              <span>Insert</span>
              <span>Charts</span>
              <span>Tools</span>
            </div>
            <div className="m-2 w-48 bg-white border border-slate-300 shadow py-1">
              <div className="px-3 py-1">New Chart</div>
              <div className="px-3 py-1">Open Offline</div>
              <div className="px-3 py-1 bg-blue-600 text-white flex items-center justify-between">
                Open Data Folder <Marker n={1} />
              </div>
              <div className="px-3 py-1">Login to Trade Account</div>
            </div>
          </div>
          <Window title="Navigator">
            <div className="p-2 space-y-1 bg-white relative">
              <div>Accounts</div>
              <div>Indicators</div>
              <div className="flex items-center gap-2">
                <span className="bg-blue-100 px-1 rounded">Expert Advisors</span>
                <div className="bg-white border border-slate-300 shadow py-0.5">
                  <div className="px-3 py-0.5 bg-blue-600 text-white flex items-center gap-2">Refresh <Marker n={3} /></div>
                </div>
              </div>
              <div className="pl-4 text-blue-700">MT4LiveBridge</div>
              <div>Scripts</div>
            </div>
          </Window>
        </div>
        <Window title="File Explorer">
          <div className="flex items-center gap-1 px-3 py-1.5 bg-white border-b border-slate-300 text-slate-600">
            ... <ChevronRight className="w-3 h-3" /> MQL4 <ChevronRight className="w-3 h-3" /> <span className="font-semibold text-slate-800">Experts</span>
            <span className="ml-auto"><Marker n={2} /></span>
          </div>
          <div className="bg-white p-2 space-y-1">
            <div className="flex items-center gap-2"><Folder className="w-3.5 h-3.5 text-amber-500" /> Advisors</div>
            <div className="flex items-center gap-2"><File className="w-3.5 h-3.5 text-slate-500" /> MACD Sample.mq4</div>
            <div className="flex items-center gap-2 bg-blue-100 rounded px-1 -mx-1 font-medium">
              <File className="w-3.5 h-3.5 text-blue-600" /> MT4LiveBridge.mq4
            </div>
          </div>
        </Window>
      </div>
    </PreviewFrame>
  );
}

export function InputsPreview() {
  const rows = [
    ['AccountLabel', 'Master-Gold-01'],
    ['SupabaseUrl', 'https://your-project.supabase.co'],
    ['SupabaseKey', 'eyJhbGciOiJIUzI1NiIs...'],
    ['BridgeKey', '3f9a1c7e5b2d...'],
  ];
  return (
    <PreviewFrame
      caption={`圖：把 EA 拖到圖表後彈出的設定視窗，Inputs（輸入參數）分頁${MT_NOTE}。數值只作示範。`}
      legend={['切換到 Inputs 分頁', 'AccountLabel 必須和網站帳戶名稱一樣', '網址和密鑰已自動填好', '按 OK 確認']}
    >
      <Window title="MT4LiveBridge">
        <div className="flex items-end gap-1 px-3 pt-2 border-b border-slate-300">
          <span className="px-3 py-1 text-slate-500">About</span>
          <span className="px-3 py-1 text-slate-500">Common</span>
          <span className="px-3 py-1 bg-white border border-b-0 border-slate-300 rounded-t font-semibold flex items-center gap-1.5">
            Inputs <Marker n={1} />
          </span>
        </div>
        <div className="p-3 bg-white">
          <table className="w-full border border-slate-300">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left font-semibold px-2 py-1 border-b border-slate-300 w-1/3">Variable</th>
                <th className="text-left font-semibold px-2 py-1 border-b border-slate-300">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, v], i) => (
                <tr key={k} className={i === 0 ? 'bg-blue-50' : ''}>
                  <td className="px-2 py-1 border-b border-slate-200">{k}</td>
                  <td className="px-2 py-1 border-b border-slate-200 font-mono">
                    <span className="inline-flex items-center gap-2">
                      {v}
                      {i === 0 && <Marker n={2} />}
                      {i === 1 && <Marker n={3} />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end items-center gap-2 mt-3">
            <Marker n={4} />
            <WinButton label="OK" primary />
            <WinButton label="Cancel" />
          </div>
        </div>
      </Window>
    </PreviewFrame>
  );
}

export function WebRequestPreview() {
  return (
    <PreviewFrame
      caption={`圖：Tools → Options → Expert Advisors（工具 → 選項 → 智能交易系統）${MT_NOTE}。網址只作示範，請貼上設定指南顯示的地址。`}
      legend={['切換到 Expert Advisors 分頁', '勾選 Allow WebRequest for listed URL', '雙擊空白行，貼上網址', '按 OK 確認']}
    >
      <Window title="Options">
        <div className="flex flex-wrap items-end gap-1 px-3 pt-2 border-b border-slate-300">
          {['Server', 'Charts', 'Objects', 'Trade'].map((t) => (
            <span key={t} className="px-2 py-1 text-slate-500">{t}</span>
          ))}
          <span className="px-2 py-1 bg-white border border-b-0 border-slate-300 rounded-t font-semibold flex items-center gap-1.5">
            Expert Advisors <Marker n={1} />
          </span>
        </div>
        <div className="p-3 bg-white space-y-2">
          <Check on label="Allow automated trading" />
          <Check on={false} label="Allow DLL imports" />
          <div className="flex items-center gap-2">
            <Check on label="Allow WebRequest for listed URL:" />
            <Marker n={2} />
          </div>
          <div className="ml-5 border border-slate-300">
            <div className="px-2 py-1 bg-blue-50 font-mono flex items-center gap-2">
              https://your-project.supabase.co <Marker n={3} />
            </div>
            <div className="px-2 py-1 text-slate-400">+ add new URL like 'https://www.mql5.com'</div>
          </div>
          <div className="flex justify-end items-center gap-2 pt-1">
            <Marker n={4} />
            <WinButton label="OK" primary />
            <WinButton label="Cancel" />
          </div>
        </div>
      </Window>
    </PreviewFrame>
  );
}

export function RunningPreview() {
  return (
    <PreviewFrame
      caption={`圖：EA 成功運行時 MT4 和網站顯示的狀態${MT_NOTE}。`}
      legend={['AutoTrading 按鈕變綠色', '圖表右上角出現 EA 名稱和笑臉', 'Experts 分頁顯示 initialized for [帳戶名稱]', '網站帳戶列表顯示 Online']}
    >
      <div className="space-y-3">
        <Window title="MetaTrader 4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-b border-slate-300">
            <span className="text-slate-400">New Order</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> AutoTrading
            </span>
            <Marker n={1} />
          </div>
          <div className="relative h-28 bg-slate-900">
            <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
              <polyline fill="none" stroke="#22d3ee" strokeWidth="1.5" points="0,80 30,70 60,75 90,55 120,60 150,40 180,48 210,30 240,36 270,20 300,25" />
            </svg>
            <div className="absolute top-2 right-2 flex items-center gap-1.5 text-white">
              <Marker n={2} /> MT4LiveBridge <Smile className="w-4 h-4 text-amber-300" />
            </div>
            <div className="absolute top-2 left-2 text-slate-400">XAUUSD,H1</div>
          </div>
          <div className="bg-white">
            <div className="flex gap-1 px-2 pt-1 border-b border-slate-300 text-slate-500">
              <span className="px-2 py-0.5">Trade</span>
              <span className="px-2 py-0.5">Journal</span>
              <span className="px-2 py-0.5 border border-b-0 border-slate-300 rounded-t bg-white text-slate-800 font-semibold">Experts</span>
            </div>
            <div className="px-2 py-1.5 font-mono flex items-center gap-2">
              <span className="text-slate-500">10:15:02</span>
              <span className="truncate">LiveBridge: v2.8 initialized for [Master-Gold-01] fast loop 100ms, signal wait 1500ms, full refresh 2s</span>
              <Marker n={3} />
            </div>
          </div>
        </Window>
        <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 flex items-center gap-4 text-sm">
          <span className="text-white font-medium">Master-Gold-01</span>
          <span className="px-2 py-0.5 rounded text-xs font-medium uppercase bg-cyan-500/20 text-cyan-400">master</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Online
          </span>
          <Marker n={4} />
        </div>
      </div>
    </PreviewFrame>
  );
}

export function ErrorLogPreview() {
  return (
    <PreviewFrame
      caption={`圖：Experts 分頁出現連線錯誤的例子${MT_NOTE}。`}
      legend={['錯誤 4060：未完成第 4 步的 WebRequest 網址設定']}
    >
      <Window title="Terminal — Experts">
        <div className="bg-white font-mono">
          <div className="px-2 py-1.5 flex items-center gap-2 text-red-700">
            <span className="text-slate-500">10:14:51</span>
            <span className="break-all">LiveBridge: err 4060 - add https://your-project.supabase.co to Tools-&gt;Options-&gt;Expert Advisors-&gt;Allow WebRequest</span>
            <Marker n={1} />
          </div>
        </div>
      </Window>
    </PreviewFrame>
  );
}
