import { BellRing, CheckCircle2, Copy, FileSpreadsheet, KeyRound, Search, Send, Share2, TrendingUp, Volume2 } from 'lucide-react';
import { Marker, PreviewFrame } from '@/components/manual/PreviewFrame';

export function EaHealthPreview() {
  const rows: [string, string, string, 'ok' | 'check' | 'bad'][] = [
    ['M-J-80745-9XMarkets', '2s ago', '-', 'ok'],
    ['F-KC-1021-Windsor', '1m ago', 'Stop loss not applied', 'check'],
    ['F-Demo-2', '3h ago', 'EA offline', 'bad'],
  ];
  const tone = { ok: 'text-emerald-400 bg-emerald-500/10', check: 'text-amber-300 bg-amber-500/10', bad: 'text-red-400 bg-red-500/10' };
  const label = { ok: 'Healthy', check: 'Check', bad: 'Problem' };
  return (
    <PreviewFrame
      caption="圖：EA Health 頁面（帳戶名稱只作示範）。"
      legend={['統計：在線、需要處理、從未連線', '每個帳戶的狀態，按一下看詳細檢查和修正步驟', '問題處理好後按 Resume healthy', '快捷登入資料：IP、帳號、伺服器、密碼']}
    >
      <div className="space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-3 gap-2 flex-1">
            {[['EAs online', '12'], ['Needs attention', '2'], ['Never connected', '0']].map(([l, v]) => (
              <div key={l} className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                <p className="text-slate-500">{l}</p>
                <p className="text-white text-lg font-bold">{v}</p>
              </div>
            ))}
          </div>
          <Marker n={1} />
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          {rows.map(([a, t, issue, s], i) => (
            <div key={a} className="grid grid-cols-[1.6fr_0.7fr_1.4fr_auto] items-center gap-2 px-3 py-2 border-b border-slate-700/50 last:border-0">
              <span className="font-mono text-slate-200 truncate">{a}</span>
              <span className="text-slate-500">{t}</span>
              <span className="text-slate-400 truncate">{issue}</span>
              <span className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded ${tone[s]}`}>{label[s]}</span>
                {i === 1 && <Marker n={2} />}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_1.2fr] gap-2">
          <span className="flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg py-2 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Resume healthy <Marker n={3} />
          </span>
          <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-white font-medium">Quick login 快捷登入</span>
            <span className="font-mono text-slate-400 ml-auto">42.2.9.53</span>
            <Copy className="w-3 h-3 text-slate-500" />
            <Marker n={4} />
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function MissedAlarmPreview() {
  return (
    <PreviewFrame
      caption="圖：甩單警報出現時，畫面頂部的紅色提示。"
      legend={['跟單帳戶開倉或平倉失敗的單', '開關警報聲', '到 EA Health 查看', '處理好後按 Resume healthy 恢復正常']}
    >
      <div className="rounded-xl border-2 border-red-500/70 bg-red-950/60 p-4 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <BellRing className="w-5 h-5 text-red-400" />
          <span className="text-white font-bold text-sm">甩單警報 · 2 missed copies</span>
          <span className="ml-auto flex items-center gap-1.5 text-red-200"><Volume2 className="w-4 h-4" /> <Marker n={2} /></span>
        </div>
        <div className="space-y-1.5">
          {[
            ['F-KC-1021-Windsor', 'XAUUSD 0.30', 'Failed to open'],
            ['F-Demo-2', 'EURUSD 0.10', 'Not copied after 30s'],
          ].map(([f, s, tag], i) => (
            <div key={f} className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
              <span className="font-mono text-white">{f}</span>
              <span className="text-red-200">missed {s}</span>
              <span className="ml-auto px-2 py-0.5 rounded bg-red-500/20 text-red-200">{tag}</span>
              {i === 0 && <Marker n={1} />}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-white flex items-center gap-1.5">View EA Health <Marker n={3} /></span>
          <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">Acknowledge</span>
          <span className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-medium flex items-center gap-1.5">Resume healthy / 恢復正常 <Marker n={4} /></span>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function HistoryFiltersPreview() {
  const chip = 'px-2.5 py-1 rounded-md border';
  return (
    <PreviewFrame
      caption="圖：Trade History 交易記錄 頁的篩選和匯出。"
      legend={['選擇一個或多個帳戶', '搜尋品種或按快捷品種', '選擇時段，可自訂日期', '匯出 Excel（交易、出入金和總結）']}
    >
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`${chip} bg-cyan-500/15 text-cyan-300 border-cyan-500/30`}>All accounts</span>
          <span className={`${chip} text-slate-300 border-slate-700`}>M-J-80745 · Master</span>
          <span className={`${chip} text-slate-300 border-slate-700`}>F-KC-1021 · Follower</span>
          <Marker n={1} />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-500">
            <Search className="w-3 h-3" /> Search symbol, e.g. XAUUSD
          </span>
          {['XAUUSD', 'EURUSD'].map((s) => <span key={s} className={`${chip} font-mono text-slate-300 border-slate-700`}>{s}</span>)}
          <Marker n={2} />
        </div>
        <div className="flex items-center gap-1.5">
          {['All Time', 'Today', 'This Week', 'This Month', 'Custom'].map((p, i) => (
            <span key={p} className={`${chip} ${i === 3 ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' : 'text-slate-400 border-slate-700'}`}>{p}</span>
          ))}
          <Marker n={3} />
          <span className="ml-auto inline-flex items-center gap-1.5 bg-emerald-600 text-white rounded-lg px-3 py-1.5 font-medium">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </span>
          <Marker n={4} />
        </div>
      </div>
    </PreviewFrame>
  );
}

export function SignalsPreview() {
  return (
    <PreviewFrame
      caption="圖：Signals · 交易信號 頁面的信號卡（數字只作示範）。"
      legend={['排序：增長、最低回撤、最長、淨值', '信號表現', '申請跟單']}
    >
      <div className="space-y-3 text-xs">
        <div className="flex items-center gap-1.5">
          {['Growth 增長', 'Lowest DD 低回撤', 'Longest 最長', 'Equity 淨值'].map((s, i) => (
            <span key={s} className={`px-2.5 py-1 rounded-md border ${i === 0 ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' : 'text-slate-400 border-slate-700'}`}>{s}</span>
          ))}
          <Marker n={1} />
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Gold Momentum</p>
            <p className="text-slate-500">9XMarkets · MT5 · <span className="text-emerald-400">Live</span></p>
          </div>
          <div className="text-right">
            <p className="text-emerald-400 font-bold text-lg inline-flex items-center gap-1"><TrendingUp className="w-4 h-4" /> +38.2%</p>
            <p className="text-slate-500">DD 6.4%</p>
          </div>
          <Marker n={2} />
          <span className="inline-flex items-center gap-1.5 bg-cyan-500 text-white rounded-lg px-3 py-2 font-medium">
            <Send className="w-3.5 h-3.5" /> 申請跟單
          </span>
          <Marker n={3} />
        </div>
      </div>
    </PreviewFrame>
  );
}

export function ReportSharePreview() {
  return (
    <PreviewFrame
      caption="圖：帳戶表現報告頂部的按鈕。"
      legend={['分享到 WhatsApp、Telegram 等，或複製連結和圖片', '列印或存成 PDF', '下載 Excel']}
    >
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm flex-1">Performance Report</span>
          <span className="inline-flex items-center gap-1.5 bg-cyan-500 text-white rounded-lg px-3 py-1.5 font-medium"><Share2 className="w-3.5 h-3.5" /> Share 分享</span>
          <Marker n={1} />
          <span className="px-3 py-1.5 rounded-lg bg-slate-700 text-white">Print / PDF</span>
          <Marker n={2} />
          <span className="px-3 py-1.5 rounded-lg bg-slate-700 text-white">Excel</span>
          <Marker n={3} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[['Balance', '$12,480'], ['Net profit', '+$2,480'], ['Max drawdown', '6.4%'], ['Win rate', '68%']].map(([l, v]) => (
            <div key={l} className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2">
              <p className="text-slate-500">{l}</p>
              <p className="text-white font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}
