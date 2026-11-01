import { Bitcoin, CheckCircle2, Clock, Download, Save, X } from 'lucide-react';
import { Marker, PreviewFrame } from '@/components/manual/PreviewFrame';

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-block w-12 h-6 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-600'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
    </span>
  );
}

export function Field({ value, focused }: { value: string; focused?: boolean }) {
  return (
    <div className={`w-full bg-slate-800 border ${focused ? 'border-cyan-500' : 'border-slate-700'} text-white rounded-lg px-3 py-2 text-sm`}>
      {value}
    </div>
  );
}

export function SetupDownloadPreview() {
  return (
    <PreviewFrame
      caption="圖：建立帳戶後彈出的「Account Created - Setup Guide」視窗（帳戶名稱只作示範）。"
      legend={['你的帳戶名稱，EA 已自動填入', '按此下載專屬 EA 檔案']}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-lg font-bold text-white">Account Created - Setup Guide</span>
          </div>
          <X className="w-5 h-5 text-slate-400" />
        </div>
        <div className="flex items-start gap-2 mb-4">
          <div className="flex-1 bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
            <p className="text-cyan-300 text-sm">
              Your account name is: <span className="font-mono font-bold">Master-Gold-01</span>
            </p>
            <p className="text-slate-400 text-xs mt-1">The AccountLabel is already filled in when you download the customized EA.</p>
          </div>
          <Marker n={1} />
        </div>
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">1</div>
          <div className="flex-1">
            <p className="text-white font-medium text-sm">Download the EA file</p>
            <p className="text-slate-400 text-sm mt-0.5">
              Download <span className="font-mono text-cyan-400">MT4LiveBridge.mq4</span> for your MT4 platform.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-2 bg-slate-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                <Download className="w-4 h-4" />
                Download MT4LiveBridge.mq4
              </span>
              <Marker n={2} />
            </div>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function FridayClosePreview() {
  return (
    <PreviewFrame
      caption="圖：Trading Rules 頁內的 Friday Close Protection 區塊（顯示預設值）。"
      legend={['開關，綠色代表開啟', '收市時間（UTC 小時）', '提前停止開倉的分鐘數']}
    >
      <div className="bg-slate-900 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-white font-medium text-sm">Friday Close Protection</span>
            <p className="text-slate-500 text-xs mt-0.5">Stop opening new positions before Friday market close</p>
          </div>
          <div className="flex items-center gap-2">
            <Toggle on />
            <Marker n={1} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-slate-400 text-xs font-medium">Close UTC Hour (0-23)</span>
              <Marker n={2} />
            </div>
            <Field value="21" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-slate-400 text-xs font-medium">Safe Minutes Before</span>
              <Marker n={3} />
            </div>
            <Field value="15" />
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function WeekendPausePreview() {
  return (
    <PreviewFrame caption="圖：Trading Rules 頁內的 Weekend Pause 區塊。" legend={['開關，綠色代表週末暫停已開啟']}>
      <div className="flex items-center justify-between gap-3 bg-slate-900 rounded-lg px-4 py-3">
        <div>
          <span className="text-white font-medium text-sm">Weekend Pause</span>
          <p className="text-slate-500 text-xs mt-0.5">Pause all signal generation on Saturday &amp; Sunday</p>
        </div>
        <div className="flex items-center gap-2">
          <Toggle on />
          <Marker n={1} />
        </div>
      </div>
    </PreviewFrame>
  );
}

export function CryptoSymbolsPreview() {
  return (
    <PreviewFrame
      caption="圖：Trading Rules 頁內的 Crypto Symbols 區塊（品種只作示範）。"
      legend={['輸入品種名稱', '按 Add 或 Enter 加入', '已加入的品種，按 X 移除']}
    >
      <div className="bg-slate-900 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bitcoin className="w-4 h-4 text-amber-400" />
          <span className="text-white font-medium text-sm">Crypto Symbols (24/7 Trading)</span>
        </div>
        <p className="text-slate-500 text-xs mb-3">These symbols bypass weekend pause and Friday close protection</p>
        <div className="flex items-center gap-2 mb-2">
          <Marker n={1} />
          <Field value="ETHUSD" focused />
          <span className="bg-slate-700 text-white px-3 py-2 rounded-lg text-sm">Add</span>
          <Marker n={2} />
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-7">
          {['BTCUSD', 'BTCUSD.m', 'XRPUSD'].map((s) => (
            <span key={s} className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 px-2 py-1 rounded text-xs">
              {s}
              <X className="w-3 h-3" />
            </span>
          ))}
          <Marker n={3} />
        </div>
      </div>
    </PreviewFrame>
  );
}

export function SignalMaxAgePreview() {
  return (
    <PreviewFrame caption="圖：Trading Rules 頁內的 Signal Max Age 區塊（顯示預設值）。" legend={['輸入秒數（30 至 3600）']}>
      <div className="bg-slate-900 rounded-lg px-4 py-3">
        <span className="block text-slate-400 text-sm font-medium mb-1">Signal Max Age (seconds)</span>
        <p className="text-slate-500 text-xs mb-2">Pending signals older than this are automatically expired</p>
        <div className="flex items-center gap-2">
          <Field value="300" />
          <Marker n={1} />
        </div>
      </div>
    </PreviewFrame>
  );
}

export function SaveSettingsPreview() {
  return (
    <PreviewFrame
      caption="圖：Trading Rules 頁底部的儲存按鈕。"
      legend={['Save rules：儲存並即時生效', 'Saved：儲存成功提示']}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-cyan-400" />
          <span className="text-lg font-bold text-white">Trading Rules · 交易規則</span>
        </div>
        <div className="h-10 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-xs">
          ……規則項目……
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 bg-cyan-500 text-white px-5 py-2.5 rounded-lg font-medium">
            <Save className="w-4 h-4" />
            Save rules
            <Marker n={1} />
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-sm">
            <CheckCircle2 className="w-4 h-4" /> Saved
            <Marker n={2} />
          </span>
        </div>
      </div>
    </PreviewFrame>
  );
}
