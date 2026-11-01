import { Gauge } from 'lucide-react';
import { Callout, Item, Path, SectionHeader, Term } from '@/components/manual/ManualParts';

export function LatencyGuide() {
  return (
    <section>
      <SectionHeader
        id="latency"
        icon={Gauge}
        title="連線延遲監察和減少延遲"
        audience="管理員 · 交易員"
        intro="跟單速度主要由三段時間組成：主帳戶發出訊號、網站轉發、跟單帳戶落單。以下教你點樣睇延遲數字，以及可以點樣再減少延遲。"
      />
      <div className="space-y-4">
        <Item n={1} title="點樣睇連線延遲">
          <p>安裝 v2.7 EA 之後，每個帳戶每 15 秒會報告兩個數字，顯示喺 EA Health 頁每一行的「Last update · Latency」欄，以及頁頂的「Connection latency 連線延遲」面板。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Broker</Term>：MT4/MT5 去券商伺服器的來回時間。綠色 50 ms 以下、黃色 50-149 ms、紅色 150 ms 或以上。</li>
            <li><Term>Cloud</Term>：EA 去網站的來回時間。綠色 400 ms 以下、黃色 400-999 ms、紅色 1000 ms 或以上。</li>
            <li>面板可以按「By broker 券商」或「By VPS 電腦」比較平均延遲，一眼睇到邊間券商或邊部 VPS 最慢。</li>
            <li>任何正在跟單的帳戶出現紅色延遲，會喺 EA Health 顯示「Connection speed: slow」，並經 Telegram 發出「連線延遲警報」（同一帳戶每小時最多一次）。</li>
          </ul>
          <Callout tone="warn">顯示「needs EA v2.7」代表該終端仍然用緊舊版 EA，請重新下載並安裝 v2.7，然後喺 MetaEditor 按 Compile (F7)。</Callout>
        </Item>

        <Item n={2} title="券商伺服器選擇">
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>MT4</Term>：按右下角連線狀態（顯示 ms 嘅位置），揀 <Path>Rescan servers</Path>，再揀 ms 最低嘅伺服器。</li>
            <li><Term>MT5</Term>：會自動揀最快嘅接入點，一般唔使理。</li>
            <li>EA 無法自動幫你轉券商伺服器，因為呢個係 MT4/MT5 本身嘅設定。</li>
          </ul>
        </Item>

        <Item n={3} title="減少延遲的 11 個方法">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li><span className="text-white font-medium">主帳戶盡量用 MT5</span>：MT5 一落單即時通知 EA，MT4 要定時檢查。</li>
            <li><span className="text-white font-medium">MT4 FastPollMs 已改為 100</span>：v2.7 預設每 0.1 秒檢查一次主帳戶，比以前快一倍。無需再手動修改。</li>
            <li><span className="text-white font-medium">主帳戶放喺獨立 VPS</span>：唔好同大量跟單帳戶擠喺同一部電腦。</li>
            <li><span className="text-white font-medium">VPS 要近券商伺服器</span>：揀同券商交易伺服器同一地區嘅 VPS（例如倫敦 LD4、紐約 NY4），唔好用屋企電腦。</li>
            <li><span className="text-white font-medium">每部 VPS 唔好開太多終端</span>：2 核心 VPS 建議約 10-15 個 MT4/MT5。</li>
            <li><span className="text-white font-medium">Windows 設定</span>：電源選項揀「高效能」，關閉自動更新和睡眠。</li>
            <li><span className="text-white font-medium">終端保持精簡</span>：每個終端只開一個圖表、只放我哋嘅 EA，關閉多餘品種報價和新聞。</li>
            <li><span className="text-white font-medium">減少圖表棒數</span>：<Path>工具 → 選項 → 圖表</Path>，「圖表最大棒數」設為 5000。</li>
            <li><span className="text-white font-medium">用 Market Execution 帳戶</span>：ECN / Raw 帳戶成交較快，少重新報價。</li>
            <li><span className="text-white font-medium">黃金等波動品種放寬滑點</span>：跟單帳戶 EA 設定（輸入參數）的 SlippagePoints 由 30 調高到 50-100，減少因價格變動而落單失敗。</li>
            <li><span className="text-white font-medium">VPS 時間自動同步</span>：Windows 設定開啟「自動設定時間」，令延遲計算準確。</li>
          </ol>
          <Callout tone="tip">分開唔同跟單組別（Team）唔會令訊號快啲，因為每個跟單帳戶都係獨立同時收訊號。真正影響速度嘅係上面呢啲電腦和網絡設定。</Callout>
        </Item>
      </div>
    </section>
  );
}
