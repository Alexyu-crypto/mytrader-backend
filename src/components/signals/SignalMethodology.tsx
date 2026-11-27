import { Layers, Maximize2 } from 'lucide-react';
import funnelImage from '@/components/signals/WhatsApp_Image_2026-11-27_at_15.32.54.jpeg';

export function SignalMethodology() {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-800/50 to-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-6">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-500/30">
            <Layers className="h-3.5 w-3.5" /> How signals are made 信號如何產生
          </p>
          <h2 className="mt-3 text-xl font-bold leading-tight text-white">7-layer signal funnel 七層信號漏斗</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
            Every signal passes through seven layers, from raw market data to a locked, approved forecast executed by the MT5 EA.
            <br />
            每個信號都經過七層處理：由原始市場數據，到批准鎖定的預測，再由 MT5 EA 執行，原預測不事後改寫。
          </p>
        </div>
        <a
          href={funnelImage}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-amber-500/40 hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" /> View full size 查看大圖
        </a>
      </div>
      <div className="p-6">
        <a
          href="https://catraderx.com/"
          target="_blank"
          rel="noopener noreferrer"
          title="Visit CATRADERX 前往 CATRADERX"
          className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded-xl"
        >
          <img
            src={funnelImage}
            alt="CATRADERX 7-layer signal funnel 七層漏斗圖"
            loading="lazy"
            className="mx-auto w-full max-w-4xl rounded-xl ring-1 ring-slate-700/80 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:ring-amber-500/50 group-hover:shadow-xl group-hover:shadow-amber-500/10"
          />
          <p className="mt-3 text-center text-xs text-slate-500 transition-colors group-hover:text-amber-300">
            Click the image to visit catraderx.com 點擊圖片前往 catraderx.com
          </p>
        </a>
      </div>
    </section>
  );
}
