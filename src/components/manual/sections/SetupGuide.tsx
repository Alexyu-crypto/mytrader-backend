import { Download } from 'lucide-react';
import { SetupDownloadPreview } from '@/components/manual/AppPreviews';
import { DataFolderPreview, InputsPreview, WebRequestPreview, RunningPreview, ErrorLogPreview } from '@/components/manual/TerminalPreviews';
import { Callout, Item, Path, SectionHeader } from '@/components/manual/ManualParts';

export function SetupGuide() {
  return (
    <section>
      <SectionHeader
        id="setup-guide"
        icon={Download}
        title="安裝 EA（五個步驟）"
        audience="管理員 · 交易員"
        intro="建立帳戶後會自動彈出設定指南，之後也可以在 Accounts 頁面的帳戶列表按「Setup」再次打開。最新版本為 LiveBridge v2.8。"
      />
      <div className="space-y-4">
        <Item n={1} title="下載 EA 檔案">
          <p>按「Download MT4LiveBridge.mq4」（MT5 帳戶會顯示 .mq5）。帳戶列表每一行的下載圖示也可以下載。</p>
          <Callout tone="warn">這個檔案已為該帳戶填好專屬設定，每個帳戶要分開下載，不可共用。</Callout>
          <SetupDownloadPreview />
        </Item>
        <Item n={2} title="把 EA 放進 MT4/MT5">
          <ol className="list-decimal pl-5 space-y-1">
            <li>打開 MT4/MT5，按左上角 <Path>檔案 → 開啟資料資料夾</Path>。</li>
            <li>MT4 進入 <Path>MQL4 → Experts</Path>；MT5 進入 <Path>MQL5 → Experts</Path>。</li>
            <li>把剛下載的檔案複製進去，如有舊版本請直接覆蓋。</li>
            <li>回到 MT4/MT5，在左邊「導航器」的「智能交易系統」上按右鍵選「重新整理」，就會看到 LiveBridge。</li>
          </ol>
          <DataFolderPreview />
        </Item>
        <Item n={3} title="確認 EA 設定">
          <p>把 EA 拖到任何一個圖表上，會彈出設定視窗。在「輸入參數」分頁確認以下四項已有內容：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="text-white font-medium">AccountLabel</span>：必須和網站上顯示的帳戶名稱完全一樣，大小寫和橫線都不能錯。</li>
            <li><span className="text-white font-medium">SupabaseUrl</span>：網站的連線地址。</li>
            <li><span className="text-white font-medium">SupabaseKey</span>：一長串連線密鑰。</li>
            <li><span className="text-white font-medium">BridgeKey</span>：此帳戶專用的保密密鑰，只有 Trader / Admin 下載的 EA 才會自動填好。請勿把 EA 檔案傳給他人。</li>
          </ul>
          <Callout tone="tip">正常情況下不需要修改任何內容。</Callout>
          <InputsPreview />
        </Item>
        <Item n={4} title="允許 EA 連線到網站">
          <ol className="list-decimal pl-5 space-y-1">
            <li>在 MT4/MT5 按 <Path>工具 → 選項 → 智能交易系統</Path>。</li>
            <li>勾選「允許 WebRequest 訪問下列 URL」。</li>
            <li>在下方清單雙擊空白行，貼上設定指南第 4 步顯示的地址（可按旁邊的「Copy」複製）。</li>
            <li>按「確定」。</li>
          </ol>
          <Callout tone="warn">如果漏了這一步，EA 會被 MT4/MT5 阻擋，無法傳送資料。</Callout>
          <WebRequestPreview />
        </Item>
        <Item n={5} title="開啟自動交易並確認運作">
          <ol className="list-decimal pl-5 space-y-1">
            <li>按工具列上的「自動交易」（AutoTrading）按鈕，變成綠色即為開啟。</li>
            <li>圖表右上角的 EA 名稱旁會出現笑臉（MT4）或藍色帽子（MT5），代表 EA 正在運行。</li>
            <li>在下方「終端」視窗打開「專家」（Experts）分頁，看到類似 <Path>LiveBridge: v2.7 initialized for [帳戶名稱]</Path> 即代表 EA 已啟動，而且沒有出現紅色錯誤訊息。</li>
            <li>回到網站的帳戶列表，該帳戶狀態應變成綠色「Online」。</li>
          </ol>
          <Callout tone="tip">EA 連線後會自動完成三件事：上載帳戶歷史、偵測 VPS 的 IP 地址（每小時重新檢查），以及上載完整品種清單供品種對應使用（每小時更新）。</Callout>
          <RunningPreview />
        </Item>
        <Item n="?" title="常見問題">
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="text-white font-medium">一直顯示 Offline</span>：檢查第 4 步的地址是否貼錯，以及自動交易是否已開啟。</li>
            <li><span className="text-white font-medium">專家分頁出現錯誤 4060 或 4014</span>：代表第 4 步的網址尚未加入。</li>
            <li><span className="text-white font-medium">IP 地址沒有出現</span>：EA 連線後一般一分鐘內會偵測到，請重新整理網頁。</li>
            <li><span className="text-white font-medium">品種對應沒有品種清單</span>：代表仍在使用舊版 EA，請重新下載並安裝 v2.7。</li>
            <li><span className="text-white font-medium">報告或交易記錄缺少舊交易／出入金</span>：EA 首次啟動時會上載整個帳戶歷史。MT4 請先在「帳戶歷史」分頁按右鍵選「所有歷史」（All History），再重新載入 EA。</li>
            <li><span className="text-white font-medium">需要 24 小時跟單</span>：MT4/MT5 必須一直開著 EA 才會運作，建議使用雲端電腦（VPS）。</li>
          </ul>
          <ErrorLogPreview />
        </Item>
      </div>
    </section>
  );
}
