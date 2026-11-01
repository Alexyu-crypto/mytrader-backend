import { ArrowRight, CheckCircle2, Layers, Plus, Search, Shuffle, Trash2, Wand2 } from 'lucide-react';
import { Marker, PreviewFrame } from '@/components/manual/PreviewFrame';
import { Field } from '@/components/manual/AppPreviews';

export function PairListPreview() {
  const rows: [string, string, 'on' | 'off' | 'wait', string][] = [
    ['M-J-80745-9X', 'F-KC-1021-Windsor', 'wait', '-'],
    ['M-J-80745-9X', 'F-AL-5520-EGlobal', 'on', 'x1.5'],
    ['M-Gold-01', 'F-Demo-2', 'off', '0.10 lot'],
  ];
  const badge = {
    on: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    off: 'bg-red-500/15 text-red-400 border-red-500/30',
    wait: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  };
  return (
    <PreviewFrame
      caption="圖：Copy Pairs · 跟單配對 頁面的配對清單（帳戶名稱只作示範）。"
      legend={['篩選和搜尋', '狀態：ON 跟單中 / OFF 暫停 / Waiting setup 待設定', 'Configure 或 Edit 打開設定', '按組別查看']}
    >
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden text-xs">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700">
          {['All', 'Enabled', 'Disabled', 'Waiting setup'].map((f, i) => (
            <span key={f} className={`px-2.5 py-1 rounded-md ${i === 0 ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400'}`}>{f}</span>
          ))}
          <span className="ml-auto flex items-center gap-1.5 text-slate-500 bg-slate-900 border border-slate-700 rounded-md px-2 py-1">
            <Search className="w-3 h-3" /> Search master or follower...
          </span>
          <Marker n={1} />
        </div>
        {rows.map(([m, f, s, lot], i) => (
          <div key={f} className="grid grid-cols-[1.3fr_1.5fr_1fr_0.7fr_auto] items-center gap-2 px-3 py-2 border-b border-slate-700/50 last:border-0">
            <span className="text-cyan-400 font-mono truncate">{m}</span>
            <span className="text-amber-400 font-mono truncate">{f}</span>
            <span className="flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded border ${badge[s]}`}>{s === 'on' ? 'ON' : s === 'off' ? 'OFF' : 'Waiting setup'}</span>
              {i === 0 && <Marker n={2} />}
            </span>
            <span className="text-slate-300">{lot}</span>
            <span className="flex items-center gap-1.5">
              <span className={`px-2.5 py-1 rounded-md ${s === 'wait' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-white'}`}>{s === 'wait' ? 'Configure' : 'Edit'}</span>
              {i === 0 && <Marker n={3} />}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-700 bg-slate-900/40">
          <span className="inline-flex items-center gap-1.5 text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 rounded-md px-2.5 py-1">
            <Layers className="w-3.5 h-3.5" /> View by group
          </span>
          <Marker n={4} />
        </div>
      </div>
    </PreviewFrame>
  );
}

export function LotModePreview() {
  return (
    <PreviewFrame caption="圖：設定視窗內的 Lot Mode 和手數欄位。" legend={['選擇計算方式', '倍數 / 固定手數', '最小和最大手數']}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-3 gap-2 flex-1">
            {['Multiplier', 'Fixed', 'Ratio'].map((m, i) => (
              <span key={m} className={`py-2 rounded-lg text-sm font-medium text-center ${i === 0 ? 'bg-cyan-500 text-white' : 'bg-slate-900 text-slate-400'}`}>
                {m}
              </span>
            ))}
          </div>
          <Marker n={1} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Lot Multiplier', '1.5', 2],
            ['Min Lot', '0.01', 3],
            ['Max Lot', '5', 3],
          ].map(([label, v, n]) => (
            <div key={label as string}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-slate-400 text-xs font-medium">{label}</span>
                <Marker n={n as number} />
              </div>
              <Field value={v as string} />
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}

export function TradeOptionsPreview() {
  const row = (label: string, on: boolean, n: number, color = 'bg-emerald-500') => (
    <div className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-3">
      <span className="text-white text-sm font-medium flex items-center gap-1.5">
        {label} <Marker n={n} />
      </span>
      <span className={`relative inline-block w-12 h-6 rounded-full ${on ? color : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </span>
    </div>
  );
  return (
    <PreviewFrame
      caption="圖：設定視窗內的交易選項。"
      legend={['反向跟單', '複製掛單', '複製止蝕 / 止賺', '同時最多跟單數量']}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {row('Reverse Trade', false, 1, 'bg-amber-500')}
          {row('Copy Pending', true, 2, 'bg-cyan-500')}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {row('Copy SL', true, 3)}
          {row('Copy TP', true, 3)}
          <div className="bg-slate-900 rounded-lg px-4 py-2">
            <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              Max Open Trades <Marker n={4} />
            </span>
            <p className="text-white text-sm py-1">3</p>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function SymbolMappingPreview() {
  const mono = 'font-mono text-sm';
  return (
    <PreviewFrame
      caption="圖：設定視窗內的 Symbol Mapping 區塊（品種名稱只作示範，請以你的經紀商為準）。"
      legend={['自動配對', '兩個帳戶的品種清單已預先載入', '一對一配對：主帳戶 → 跟單帳戶', '其他品種的通用規則', '預覽，黃色代表跟單帳戶沒有此名稱']}
    >
      <div className="bg-slate-900 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-white font-medium text-sm">
            <Shuffle className="w-4 h-4 text-cyan-400" /> Symbol Mapping
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg">
              <Wand2 className="w-3.5 h-3.5" /> Auto-match
            </span>
            <Marker n={1} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-2 gap-2 flex-1">
            {[['Master', 312], ['Follower', 287]].map(([l, n]) => (
              <span key={l} className="flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> <span className="font-medium">{l}:</span> {n} symbols preloaded
              </span>
            ))}
          </div>
          <Marker n={2} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Field value="XAUUSD" focused />
            <ArrowRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <Field value="GOLD" />
            <span className="p-2 bg-slate-700 text-white rounded-lg"><Plus className="w-4 h-4" /></span>
            <Marker n={3} />
          </div>
          <div className="border border-slate-800 rounded-lg divide-y divide-slate-800">
            {[['US30', 'DJ30'], ['XAUUSD', 'GOLD']].map(([a, b]) => (
              <div key={a} className="flex items-center gap-2 px-3 py-1.5">
                <span className={`${mono} text-cyan-400 flex-1`}>{a}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                <span className={`${mono} text-amber-400 flex-1`}>{b}</span>
                <Trash2 className="w-3.5 h-3.5 text-slate-600" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="grid grid-cols-3 gap-2 flex-1">
            {[['Remove suffix', ''], ['Add prefix', ''], ['Add suffix', '.m']].map(([l, v]) => (
              <div key={l}>
                <span className="block text-slate-500 text-[11px] mb-1">{l}</span>
                <Field value={v || '\u00a0'} />
              </div>
            ))}
          </div>
          <Marker n={4} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[['EURUSD', 'EURUSD.m', true], ['XAUUSD', 'GOLD', true], ['NAS100', 'NAS100.m', false]].map(([a, b, ok]) => (
            <span
              key={a as string}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
                ok ? 'border-slate-700 text-slate-300' : 'border-amber-500/40 text-amber-300 bg-amber-500/10'
              }`}
            >
              {a} <ArrowRight className="w-3 h-3 opacity-60" /> {b}
            </span>
          ))}
          <Marker n={5} />
        </div>
      </div>
    </PreviewFrame>
  );
}
