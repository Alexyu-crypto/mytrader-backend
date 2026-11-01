import { Radio } from 'lucide-react';
import { ReportSharePreview, SignalsPreview } from '@/components/manual/MonitorPreviews';
import { Callout, Item, SectionHeader, Term } from '@/components/manual/ManualParts';

export function ClientGuide() {
  return (
    <section>
      <SectionHeader
        id="client"
        icon={Radio}
        title="客戶指南：信號、申請跟單和報告"
        audience="客戶 · 代理商 · 所有用戶"
        intro="客戶可以瀏覽交易信號、申請跟單，並查看自己帳戶的持倉和記錄。"
      />
      <div className="space-y-4">
        <Item n={1} title="Signals · 交易信號">
          <p>頁面列出所有可跟單的信號，頂部顯示 Signals 信號 和 Live 運行中 的數量。可搜尋名稱，或按 Growth 增長、Lowest DD 低回撤、Longest 最長、Equity 淨值 排序。</p>
          <p>按信號卡可查看詳情，包括盈利曲線和每月回報。按「Invite friends 邀請朋友」可把信號分享給朋友。</p>
          <SignalsPreview />
        </Item>

        <Item n={2} title="申請跟單（Copy this signal 申請跟單）">
          <ol className="list-decimal pl-5 space-y-1">
            <li>在信號卡或詳情頁按申請跟單。</li>
            <li>填寫 Your name 姓名、Phone / WhatsApp / Telegram 和 Platform 平台。Broker 經紀商、Account no. 帳戶號碼、Planned capital 預計資金 (USD) 可留空，Message 備註可寫下任何問題。</li>
            <li>閱讀並勾選風險聲明，按「Send application 送出申請」。</li>
            <li>送出後畫面會說明接下來的三個步驟，我們的團隊會盡快聯絡你。</li>
          </ol>
        </Item>

        <Item n={3} title="My applications 我的申請">
          <p>在 Signals 頁可看到自己所有申請和最新狀態：New 新申請、Contacted 已聯絡、Approved 已批准、Rejected 已拒絕、Cancelled 已取消。</p>
          <p>未處理的申請可按「Cancel 取消」，再按「Confirm cancel 確認取消」撤回。</p>
        </Item>

        <Item n={4} title="Live Trading 即時交易 和 Trade History 交易記錄">
          <p>客戶看到的持倉和記錄頁與管理員相同，但只包括自己的帳戶和已跟隨的信號。持倉頁可按 All 全部、My accounts 我的帳戶、Signals 信號 切換；記錄頁可篩選時段和品種，並匯出 Excel。</p>
        </Item>

        <Item n={5} title="帳戶表現報告和分享">
          <p>在帳戶或信號旁按報告連結，可看到完整表現報告：Balance、Net profit、Net capital、Max drawdown、Win rate、Profit factor、Trades、Open positions，以及每月回報、交易品種、回報日曆、交易統計和市場分析。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Share</Term>：分享到 WhatsApp、Telegram、Facebook、X、LinkedIn、LINE、Email 電郵或 More 更多；也可 Copy link 複製連結、Copy post text 複製帖文，或 Share image 分享圖片（適合 IG、WeChat 和限時動態）。</li>
            <li><Term>Print / PDF</Term>：列印或存成 PDF。<Term>Excel</Term>：下載數據。</li>
            <li><Term>Join</Term>：未加入的訪客可以直接申請。</li>
          </ul>
          <Callout tone="tip">報告設為「Members · 限成員」時，訪客要按「Sign in · 登入」才可查看。</Callout>
          <ReportSharePreview />
        </Item>

        <Item n={6} title="Membership 和 Become an Agent">
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Membership · 會員收費</Term>：查看會員方案，按「請現在加入 · Join now」加入。</li>
            <li><Term>Become an Agent · 成為代理商</Term>：填表申請成為代理商，可擁有代理商後台、自己的品牌和自己的客戶。之前的申請會列在「Past applications 過往申請」。</li>
          </ul>
        </Item>
      </div>
    </section>
  );
}
