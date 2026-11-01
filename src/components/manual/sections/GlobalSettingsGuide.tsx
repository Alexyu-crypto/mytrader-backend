import { Settings2 } from 'lucide-react';
import {
  FridayClosePreview,
  WeekendPausePreview,
  CryptoSymbolsPreview,
  SignalMaxAgePreview,
  SaveSettingsPreview,
} from '@/components/manual/AppPreviews';
import { Callout, Item, SectionHeader } from '@/components/manual/ManualParts';

export function GlobalSettingsGuide() {
  return (
    <section>
      <SectionHeader
        id="global-settings"
        icon={Settings2}
        title="Trading Rules · 交易規則"
        audience="管理員 · 交易員"
        intro="在 Dashboard 頁面頂部，按 Followers 旁邊的「Trading Rules · 交易規則」分頁打開。這裡的設定會套用到所有主帳戶和跟單帳戶，主要控制「什麼時間可以跟單」。"
      />
      <div className="space-y-4">
        <Item n={1} title="Friday Close Protection（週五收市保護）">
          <p>週五收市前一段時間停止開新倉，避免週末價格跳空，週一開市時出現超出預期的虧損。開關變綠色即為開啟，之後會出現兩個欄位：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="text-white font-medium">Close UTC Hour（0-23）</span>：外匯週五收市時間，以國際標準時間 UTC 填寫，預設 21。</li>
            <li><span className="text-white font-medium">Safe Minutes Before</span>：收市前多少分鐘開始停止開新倉，預設 15。</li>
          </ul>
          <Callout tone="tip">例子：填 21 和 15，即 UTC 週五 20:45 起不再跟單開新倉，相當於香港時間（UTC+8）週六早上 4:45。</Callout>
          <Callout tone="warn">夏令時期間外匯大約在 UTC 21:00 收市，冬令時約 22:00。冬天建議改為 22，或向經紀商確認實際收市時間。</Callout>
          <FridayClosePreview />
        </Item>
        <Item n={2} title="Weekend Pause（週末暫停）">
          <p>開啟後，週六和週日（以 UTC 計算）全日暫停所有跟單訊號。外匯週末本身休市，開啟可避免週末出現錯誤或延遲的訊號。</p>
          <Callout tone="tip">一般建議保持開啟。</Callout>
          <WeekendPausePreview />
        </Item>
        <Item n={3} title="Crypto Symbols（加密貨幣品種，24/7 交易）">
          <p>加密貨幣週末也有交易，加入這裡的品種不受上面兩項限制，週五晚上和週末照樣跟單。</p>
          <p>用法：在輸入框輸入品種名稱（例如 BTCUSD），按「Add」或 Enter 加入。品種會顯示為黃色標籤，按標籤上的 X 可移除。</p>
          <Callout tone="warn">名稱必須和經紀商 MT4/MT5 上顯示的完全一樣，例如有些叫 BTCUSD，有些叫 BTCUSD.m 或 BITCOIN。</Callout>
          <CryptoSymbolsPreview />
        </Item>
        <Item n={4} title="Signal Max Age（訊號最長有效時間，秒）">
          <p>主帳戶開單後會產生跟單訊號。如果跟單帳戶在這段時間內沒有執行，訊號會自動作廢，避免跟單帳戶離線後重新上線時，以已大幅變動的價格追單。</p>
          <p>預設 300 秒（5 分鐘），可設定 30 至 3600 秒。</p>
          <Callout tone="tip">短線交易可設短一點（例如 60 秒），長線可保持 300 秒。</Callout>
          <SignalMaxAgePreview />
        </Item>
        <Item n={5} title="儲存設定">
          <p>修改後按頁面底部的「Save rules」，看到「Saved」即代表已生效。未儲存就離開頁面，修改不會保留。</p>
          <SaveSettingsPreview />
        </Item>
      </div>
    </section>
  );
}
