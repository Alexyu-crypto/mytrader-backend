import { Users } from 'lucide-react';
import { AccountsToolbarPreview, AddAccountPreview } from '@/components/manual/AccountPreviews';
import { Callout, Item, Path, SectionHeader, Term } from '@/components/manual/ManualParts';

export function AccountsGuide() {
  return (
    <section>
      <SectionHeader
        id="accounts"
        icon={Users}
        title="Accounts：新增和管理帳戶"
        audience="管理員 · 交易員"
        intro="所有 MT4/MT5 帳戶都在左邊選單的「Accounts」頁管理。主帳戶（Master）是發出交易的帳戶，跟單帳戶（Follower）會自動複製主帳戶的交易。"
      />
      <div className="space-y-4">
        <Item n={1} title="新增單一帳戶">
          <p>按右上角「Add New Account」，填寫以下資料：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Account Type</Term>：M Master（主帳戶）或 F Follower（跟單帳戶）。<span className="text-amber-300">建立後不能更改。</span></li>
            <li><Term>Account Holder Name、MT4/MT5 Account Number（3 至 12 位數字）、Broker</Term>：必填。</li>
            <li><Term>Broker Server</Term>：選填，方便日後登入。</li>
            <li><Term>VPS / IP Address</Term>：選填。留空的話，EA 連線後會自動偵測並每小時更新，列表會顯示綠色「AUTO」標籤。</li>
            <li><Term>Password 密碼</Term>：選填，只有管理員和交易員看得到。</li>
            <li><Term>Platform</Term>：MT4 或 MT5。</li>
          </ul>
          <p>系統會自動產生帳戶名稱，例如 <Path>M-J-80745-9XMarkets</Path>。這個名稱必須和 EA 的 AccountLabel 完全一樣，從網站下載的 EA 已自動填好。</p>
          <AddAccountPreview />
        </Item>

        <Item n={2} title="批量開戶（Import 批量開戶）">
          <ol className="list-decimal pl-5 space-y-1">
            <li>按「Import 批量開戶」，再按「Template 範本」下載範本檔。</li>
            <li>用 Excel 填好每一行：holder_name、account_number、broker、broker_server、platform、type、password。type 填 master 或 follower。</li>
            <li>另存為 CSV（檔案要小於 1 MB），拖進視窗。</li>
            <li>系統會先檢查並顯示「N ready 可新增」和「N with problems 有問題」，有問題的行會說明原因。</li>
            <li>確認後按「Import N accounts 新增」，完成後會顯示結果。</li>
          </ol>
          <Callout tone="tip">按「Export 匯出」可把所有帳戶下載成檔案，方便備份或核對。</Callout>
        </Item>

        <Item n={3} title="帳戶列表">
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Search 搜尋</Term>：輸入名稱、帳號或經紀商篩選。在鍵盤按 <Path>/</Path> 可直接跳到搜尋框，按 Esc 清除。</li>
            <li><Term>Broker</Term>：按一下可複製伺服器名稱。</li>
            <li><Term>Login IP</Term>：顯示 VPS 地址；沒有的話可按「+ Add IP」手動加入。</li>
            <li><Term>Status</Term>：綠色 Online 代表 EA 正在運作。</li>
            <li><Term>Report</Term>：切換報告為「Public · 公開」（任何人有連結都可看）或「Members · 限成員」（要登入才可看）。</li>
            <li>每行右邊可下載 EA、打開 Setup 設定指南、Edit 修改或 Delete 刪除。</li>
          </ul>
          <Callout tone="warn">刪除帳戶會一併移除該帳戶的跟單設定，請小心使用。</Callout>
          <AccountsToolbarPreview />
        </Item>

        <Item n={4} title="更改角色：Master ↔ Follower">
          <ul className="list-disc pl-5 space-y-1">
            <li>在帳戶列表按 <Term>Edit</Term>，再按 <Term>Master</Term> 或 <Term>Follower</Term> 按鈕。</li>
            <li>系統會顯示新名稱，例如 <Path>M-KC-123456-IC</Path> 會變成 <Path>F-KC-123456-IC</Path>。按 Save 確認。</li>
            <li>交易紀錄、報告和出入金紀錄會自動跟隨新名稱，不會遺失。</li>
            <li><Term>Master → Follower</Term>：如果仍有跟單帳戶，要先到 <Path>Copy Groups</Path> 用「一鍵更換主帳戶」把他們轉走。</li>
            <li><Term>Follower → Master</Term>：如果它正在跟其他主帳戶，請勾選「移除現有跟單連結」。</li>
            <li>如果仍有跟單訊號在處理中，請等幾秒再試。</li>
          </ul>
          <Callout tone="warn">儲存後必須在 MT4/MT5 把 EA 的 AccountLabel 改成新名稱（或重新下載 EA），否則帳戶會顯示離線。</Callout>
        </Item>
      </div>
    </section>
  );
}
