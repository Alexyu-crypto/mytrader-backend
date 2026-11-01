import { Activity } from 'lucide-react';
import { EaHealthPreview, HistoryFiltersPreview, MissedAlarmPreview } from '@/components/manual/MonitorPreviews';
import { Callout, Item, SectionHeader, Term } from '@/components/manual/ManualParts';

export function MonitoringGuide() {
  return (
    <section>
      <SectionHeader
        id="monitoring"
        icon={Activity}
        title="監察交易：Dashboard、持倉、記錄和 EA Health"
        audience="管理員 · 交易員 · 觀察員"
        intro="這些頁面讓你即時掌握所有帳戶的狀況，並在跟單出問題時第一時間收到警報。"
      />
      <div className="space-y-4">
        <Item n={1} title="Dashboard">
          <p>頂部四張卡顯示帳戶數量（及在線數目）、Open Positions、Floating P&L 和 Active Copy Signals。可按 All Accounts / masters / followers 篩選。</p>
          <p>下面分別列出 Master Accounts 和 Follower Accounts，最底的 <Term>Copy Engine Log</Term> 顯示最近每一張跟單的處理結果。</p>
        </Item>

        <Item n={2} title="Live Positions（即時持倉）">
          <ul className="list-disc pl-5 space-y-1">
            <li>頂部顯示 Open Positions、Floating P&L、Buy Lots 和 Sell Lots。</li>
            <li>分頁 All Accounts / Masters / Followers 切換顯示的帳戶。</li>
            <li>按欄位標題可排序。<Term>Delay</Term> 欄顯示跟單比主帳戶慢了多少秒。</li>
            <li>跟單帳戶的單可按「Close 平倉」手動平倉，確認視窗會問「Close this position? 確認平倉？」。</li>
            <li>按「Export」可下載 Excel，包括總結和所有持倉（含 Copy Delay）。</li>
          </ul>
        </Item>

        <Item n={3} title="History（交易記錄）">
          <ul className="list-disc pl-5 space-y-1">
            <li>上方按 Today / This Week / This Month / All Time 查看不同時段的盈虧。</li>
            <li>卡片顯示 Selected Net P&L、Gross Profit、Commission、Swap、Win Rate 和 Trades。</li>
            <li>篩選：選擇一個或多個帳戶、搜尋品種或按 Quick pick 快捷品種、選擇時段（可用 Custom 自訂日期）。</li>
            <li><Term>Delay</Term> 欄顯示開倉和平倉各慢了多少秒。下方另有出入金記錄。</li>
            <li>「Export Excel」會下載三頁：Summary、Closed Trades、Deposits & Withdrawals。</li>
          </ul>
          <HistoryFiltersPreview />
        </Item>

        <Item n={4} title="EA Health">
          <p>集中檢查每個帳戶的 EA 是否運作正常。頂部顯示 EAs online、Needs attention、Never connected 和 Total accounts，可按「Needs attention」只看有問題的帳戶。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Healthy</Term> 正常、<Term>Check</Term> 需要留意、<Term>Problem</Term> 出問題、<Term>Idle</Term> 沒有活動。</li>
            <li>按一行展開，會看到每項檢查的結果和「How to fix」修正步驟。</li>
            <li>處理好後按「Resume healthy」，或「Resume all N checks」一次過恢復；按錯可按「Undo」。</li>
            <li><Term>Quick login 快捷登入</Term>：顯示 VPS IP（自動偵測的會標明時間）、帳號、伺服器和密碼，每項旁邊有複製按鈕，方便遙距登入處理。</li>
          </ul>
          <EaHealthPreview />
        </Item>

        <Item n={5} title="甩單警報（Missed Copy Alarm）">
          <p>當跟單帳戶開倉或平倉失敗，所有頁面頂部都會出現紅色警報，並響起警報聲 10 秒。標籤會說明原因：Failed to open、Failed to close、Not copied after Xs 或 Still open after Xs。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>按喇叭圖示可開關聲音；在 EA Health 頁可按「Test alarm」試聽。</li>
            <li>「View EA Health」查看詳情，「Acknowledge」表示已知悉。</li>
            <li>處理好後按綠色大按鈕「Resume healthy / 恢復正常」。</li>
          </ul>
          <Callout tone="warn">瀏覽器要求先在網頁上按一下才可以播放聲音。打開網站後請先隨便按一下畫面，確保警報響得到。</Callout>
          <MissedAlarmPreview />
        </Item>
      </div>
    </section>
  );
}
