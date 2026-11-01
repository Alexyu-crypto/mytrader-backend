import { SlidersHorizontal } from 'lucide-react';
import { Callout, Item, Path, SectionHeader, Term } from '@/components/manual/ManualParts';
import { LotModePreview, PairListPreview, SymbolMappingPreview, TradeOptionsPreview } from '@/components/manual/CopySettingsPreviews';

export function CopySettingsGuide() {
  return (
    <section>
      <SectionHeader
        id="copy-settings"
        icon={SlidersHorizontal}
        title="Copy Pairs · 跟單配對 詳解"
        audience="管理員 · 交易員"
        intro="每一對「主帳戶 → 跟單帳戶」都有自己的一組設定，決定跟不跟、跟多少手、跟哪些品種，以及品種名稱怎樣轉換。觀察員只可查看（View only · 只可查看），不能修改。"
      />
      <div className="space-y-4">
        <Item n={1} title="配對列表：選擇要設定的一對帳戶">
          <p>在左邊選單按「Copy Pairs · 跟單配對」。列表每一行是一對「Master → Follower」，顯示狀態（Status）和手數（Lot）。按右邊的「Configure」或「Edit」打開設定視窗。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Enabled</Term>：正在跟單。</li>
            <li><Term>Disabled</Term>：已設定但暫停，不會產生新的跟單。</li>
            <li><Term>Waiting setup</Term>：尚未設定，這對帳戶不會跟單。這些配對會排在最前面，方便你先處理。</li>
          </ul>
          <p>上方可按 All / Enabled / Disabled / Waiting setup 篩選，或用搜尋框找帳戶名稱。按「View by group」可轉到以主帳戶分組的 Copy Groups 頁面。</p>
          <PairListPreview />
        </Item>

        <Item n={2} title="Enabled 和 Lot Mode（手數計算方式）">
          <p>視窗最上方的 <Term>Enabled</Term> 開關控制這對帳戶是否跟單。下面選擇手數的計算方式：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Multiplier（倍數）</Term>：跟單手數 = 主帳戶手數 × 倍數。例如主帳戶開 0.2 手，倍數 1.5，跟單開 0.3 手。</li>
            <li><Term>Fixed（固定）</Term>：不論主帳戶開多少，跟單一律開固定手數。</li>
            <li><Term>Ratio（按資金比例）</Term>：跟單手數 = 主帳戶手數 × （跟單帳戶結餘 ÷ 主帳戶結餘）× 倍數。例如主帳戶結餘 10,000，跟單 5,000，主帳戶開 1 手，倍數 1，跟單開 0.5 手。</li>
          </ul>
          <p><Term>Min Lot / Max Lot</Term>：計算結果會被限制在這個範圍內，並四捨五入到 0.01 手。</p>
          <Callout tone="warn">Max Lot 是重要的安全上限，建議按跟單帳戶的資金設定，避免主帳戶開大手時跟單帳戶風險過高。</Callout>
          <LotModePreview />
        </Item>

        <Item n={3} title="交易選項">
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Reverse Trade（反向跟單）</Term>：主帳戶買入時跟單帳戶賣出，反之亦然；止蝕和止賺位置會對調。掛單會變成相反方向的掛單，例如 Buy Limit 變 Sell Stop。</li>
            <li><Term>Copy Pending（複製掛單）</Term>：開啟後連同 Limit / Stop 掛單一起跟；關閉則只跟已成交的市價單。</li>
            <li><Term>Copy Stop Loss / Copy Take Profit</Term>：關閉後跟單不會設定止蝕或止賺，適合想自行管理出場的帳戶。主帳戶平倉時，跟單一樣會跟著平倉。</li>
            <li><Term>Max Open Trades</Term>：這對帳戶同時最多有幾張跟單，填 0 代表不限。到達上限後的新單不會跟，有空位時才會再跟主帳戶仍然持有的單。</li>
          </ul>
          <TradeOptionsPreview />
        </Item>

        <Item n={4} title="Symbol Mapping（品種名稱對應）">
          <p>不同經紀商對同一品種的叫法可能不同，例如主帳戶叫 <Path>XAUUSD</Path>，跟單帳戶叫 <Path>GOLD</Path> 或 <Path>XAUUSD.m</Path>。名稱不一致時跟單會失敗，這時就要設定對應。</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li><Term>一對一配對</Term>：左邊填主帳戶的名稱，右邊填跟單帳戶的名稱，按「+」或 Enter 加入。輸入框會列出兩個帳戶的完整品種清單供你選擇。按垃圾桶圖示可刪除。</li>
            <li><Term>通用規則</Term>：其他沒有一對一配對的品種，會先「Remove suffix」移除後綴，再加上「Add prefix」前綴和「Add suffix」後綴。例如跟單經紀商所有品種都帶 .m，只要在 Add suffix 填 <Path>.m</Path>，EURUSD 就會變成 EURUSD.m。</li>
            <li><Term>Auto-match</Term>：系統按名稱相似程度，自動配對兩個帳戶的品種，例如 XAUUSD 配 GOLD、EURUSD 配 EURUSD.m。按完請逐一檢查結果。</li>
            <li><Term>預覽</Term>：列出主帳戶的品種轉換後的名稱。以黃色顯示的，代表跟單帳戶的品種清單中沒有這個名稱，請再三確認是否正確。</li>
          </ol>
          <Callout tone="tip">v2.7 或以上的 EA 啟動時會把整個 MT4/MT5 的品種清單上載到網站，之後每小時更新。視窗內會顯示每個帳戶已載入多少個品種；如果顯示未載入，請到 Accounts 頁重新下載並安裝 v2.7 EA。</Callout>
          <Callout tone="tip">一對一配對優先於通用規則。平倉時會使用開倉時轉換後的名稱，所以不會平錯品種。</Callout>
          <Callout tone="warn">對應只會套用在之後的新開倉。已經開出的跟單維持原來的名稱。</Callout>
          <SymbolMappingPreview />
        </Item>

        <Item n={5} title="Allowed Symbols 和 Blocked Symbols（品種過濾）">
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Allowed Symbols</Term>：只跟清單內的品種。留空代表全部都跟。</li>
            <li><Term>Blocked Symbols</Term>：清單內的品種一律不跟。</li>
          </ul>
          <p>輸入名稱後按「Add」或 Enter 加入，按標籤上的 X 移除。</p>
          <Callout tone="warn">這兩個清單要填<Term>主帳戶</Term>的品種名稱，不是轉換後的名稱。</Callout>
        </Item>

        <Item n={6} title="儲存或刪除">
          <p>按「Save Settings」儲存，設定會在數秒內生效。「Delete」會刪除這對帳戶的整組設定，之後不再跟單；已開出的跟單仍會在主帳戶平倉時跟著平倉。「Cancel」或右上角 X 則放棄修改。</p>
        </Item>
      </div>
    </section>
  );
}
