import { MonitorDown } from 'lucide-react';
import { Callout, Item, SectionHeader, Term } from '@/components/manual/ManualParts';

export function PcSetupGuide() {
  return (
    <section>
      <SectionHeader
        id="pc-setup"
        icon={MonitorDown}
        title="PC Install Package · 電腦安裝包"
        audience="管理員 · 交易員 · 客戶 · 代理商"
        intro="下載一個安裝檔，喺 Windows 10 / 11 或 Windows Server 執行，就會自動為每個戶口開一個獨立 MT4 / MT5，登入、放好 EA、開 EURUSD 圖表，再並列排好所有視窗。"
      />
      <div className="space-y-4">
        <Item n={1} title="喺邊度下載">
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>管理員 / 交易員</Term>：喺「跟單組別」頁，按組別上嘅電腦圖示「PC install package」，剔選要安裝嘅戶口。</li>
            <li><Term>客戶 / 代理商</Term>：喺左邊選單「PC Setup · 電腦安裝」，按「建立安裝包」，可以自訂安裝包名稱（會顯示喺桌面捷徑）。</li>
            <li>代理商要為旗下客戶戶口建立安裝包，需要管理員喺代理商設定開啟「電腦安裝包」權限。</li>
          </ul>
        </Item>
        <Item n={2} title="即刻安裝定係第二部電腦安裝">
          <p><Term>即刻喺呢部電腦安裝</Term>：檔案 1 小時內有效。<Term>儲存到其他電腦安裝</Term>：檔案 7 日內有效，用 USB 或雲端複製過去。</p>
          <Callout tone="tip">每個檔案只可以用喺一部電腦，檔案入面冇任何密碼，密碼會喺安裝時先由網站安全送到電腦。</Callout>
        </Item>
        <Item n={3} title="執行安裝檔">
          <ol className="list-decimal pl-5 space-y-1">
            <li>雙擊檔案。如果 Windows 顯示「已保護您的電腦」，按「其他資訊」→「仍要執行」。</li>
            <li>允許管理員權限。</li>
            <li>程式會先檢測電腦容量（記憶體、CPU、硬碟）。如果戶口太多，會停止安裝並顯示最高可以開幾多個 MT，返網站減少戶口再下載。</li>
            <li>每部電腦第一次安裝，會打開 MT 教你設定一次：允許網站網址、MT4 圖表 K 線數 5000、MT4「帳戶歷史」右鍵揀「全部歷史」。之後所有戶口都會沿用。</li>
          </ol>
        </Item>
        <Item n={4} title="24 小時運行設定（自動）">
          <ul className="list-disc pl-5 space-y-1">
            <li>電源轉為「高效能」，永不休眠、不關螢幕、不關硬碟。</li>
            <li>Windows Update 只會喺你揀嘅時候安裝，唔會自動重開機，亦唔會自動更新驅動程式。</li>
            <li>MT 當機、被關閉、停電或重開機後，會自動重開並重新排列視窗（每 2 分鐘檢查一次）。</li>
            <li>安裝時可選擇開啟「自動登入 Windows」，重開機後唔使人手登入，MT 都會自己重開。</li>
          </ul>
          <Callout tone="warn">開啟自動登入會把 Windows 密碼儲存喺嗰部電腦，只適合放喺安全地方嘅交易電腦或 VPS。停電後要電腦自己開機，請喺 BIOS 設定「Restore on AC power loss = Power On」。</Callout>
        </Item>
        <Item n={5} title="桌面捷徑">
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>啟動全部</Term>：打開所有 MT 並並列排好。</li>
            <li><Term>全部關閉</Term>：關閉所有 MT，期間唔會自動重開，方便維護；再按「啟動全部」就回復。</li>
            <li><Term>重新排列</Term>：視窗亂咗時重新並列。</li>
            <li><Term>解除安裝</Term>：會先檢查有冇未平倉單，確認後一次過移除此組別所有 MT。移除最後一個組別時，會還原電腦原本嘅電源、休眠同更新設定。</li>
          </ul>
        </Item>
        <Item n={6} title="睇安裝進度">
          <p>喺安裝視窗嘅「紀錄」分頁（客戶 / 代理商喺「電腦安裝」頁下面），可以睇到每個安裝包嘅狀態、電腦名稱、硬件同最高容量。</p>
          <Callout tone="tip">第一次用建議先揀 2 個戶口試裝，確認正常後再裝全組。</Callout>
        </Item>
      </div>
    </section>
  );
}
