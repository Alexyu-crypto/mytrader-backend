import type { ComponentType } from 'react';
import {
  SetupDownloadPreview,
  FridayClosePreview,
  WeekendPausePreview,
  CryptoSymbolsPreview,
  SignalMaxAgePreview,
  SaveSettingsPreview,
} from '@/components/manual/AppPreviews';
import { DataFolderPreview, InputsPreview, WebRequestPreview, RunningPreview, ErrorLogPreview } from '@/components/manual/TerminalPreviews';
import { LotModePreview, PairListPreview, SymbolMappingPreview, TradeOptionsPreview } from '@/components/manual/CopySettingsPreviews';
import { AccountsToolbarPreview, AddAccountPreview, CopyGroupPreview } from '@/components/manual/AccountPreviews';
import { EaHealthPreview, HistoryFiltersPreview, MissedAlarmPreview, ReportSharePreview, SignalsPreview } from '@/components/manual/MonitorPreviews';

export interface Caption {
  zh: string;
  en: string;
}

export interface Scene {
  chapter: number;
  title: Caption;
  visual?: ComponentType;
  lines: Caption[];
}

export const CHAPTERS: Caption[] = [
  { zh: '簡介', en: 'Introduction' },
  { zh: '新增帳戶', en: 'Accounts' },
  { zh: '安裝 EA', en: 'Install the EA' },
  { zh: '跟單設定', en: 'Copy setup' },
  { zh: '交易規則', en: 'Trading rules' },
  { zh: '監察和警報', en: 'Monitoring' },
  { zh: '客戶功能', en: 'For clients' },
  { zh: '總結', en: 'Wrap-up' },
];

export const SCENES: Scene[] = [
  {
    chapter: 0,
    title: { zh: 'MyTrader Tools 使用教學', en: 'MyTrader Tools tutorial' },
    lines: [
      { zh: '歡迎使用 MyTrader Tools，這段教學會帶你走完整個使用手冊。', en: 'Welcome to MyTrader Tools. This tutorial walks you through the whole user manual.' },
      { zh: '內容包括新增帳戶、安裝 EA、跟單設定、交易規則、監察警報和客戶功能。', en: 'It covers accounts, installing the EA, copy setup, trading rules, monitoring and client features.' },
      { zh: '可以按上方的章節按鈕直接跳到想看的部分。', en: 'Use the chapter buttons above to jump straight to any part.' },
    ],
  },
  {
    chapter: 1,
    title: { zh: '新增帳戶', en: 'Add an account' },
    visual: AddAccountPreview,
    lines: [
      { zh: '在 Accounts 頁按「Add New Account」，先選 Master 主帳戶或 Follower 跟單帳戶。', en: 'On Accounts, click "Add New Account" and choose Master or Follower first.' },
      { zh: '帳戶類型建立後不能更改，請小心選擇。', en: 'The account type cannot be changed later, so choose carefully.' },
      { zh: '填寫持有人名稱、帳號和經紀商。IP 地址可以留空，EA 連線後會自動偵測。', en: 'Fill in the holder name, account number and broker. Leave the IP empty: the EA detects it.' },
      { zh: '系統會自動產生帳戶名稱，它必須和 EA 的 AccountLabel 一樣。', en: 'The account name is generated for you and must match the EA’s AccountLabel.' },
    ],
  },
  {
    chapter: 1,
    title: { zh: '帳戶列表和批量開戶', en: 'Account list and bulk import' },
    visual: AccountsToolbarPreview,
    lines: [
      { zh: '「Import 批量開戶」可用 CSV 檔一次過新增多個帳戶，先下載範本再填寫。', en: '"Import" adds many accounts at once from a CSV file. Download the template first.' },
      { zh: '「Export 匯出」把所有帳戶下載成檔案。', en: '"Export" downloads all your accounts as a file.' },
      { zh: '自動偵測的 IP 會顯示綠色 AUTO 標籤，每小時更新一次。', en: 'Auto-detected IPs show a green AUTO tag and refresh every hour.' },
      { zh: 'Report 欄可切換報告為公開或只限成員查看。', en: 'The Report column switches each report between public and members only.' },
    ],
  },
  {
    chapter: 2,
    title: { zh: '步驟 1：下載 EA 檔案', en: 'Step 1: Download the EA file' },
    visual: SetupDownloadPreview,
    lines: [
      { zh: '建立帳戶後會自動彈出設定指南，也可以在帳戶列表按「Setup」再次打開。', en: 'The setup guide opens after you create an account. Reopen it with "Setup" in the list.' },
      { zh: '按「Download」下載 v2.7 EA。每個帳戶的檔案都是專屬的，不可共用。', en: 'Click "Download" to get the v2.7 EA. Each file belongs to one account only.' },
    ],
  },
  {
    chapter: 2,
    title: { zh: '步驟 2：把 EA 放進 MT4/MT5', en: 'Step 2: Put the EA into MT4/MT5' },
    visual: DataFolderPreview,
    lines: [
      { zh: '在 MT4/MT5 按「檔案 → 開啟資料資料夾」，進入 Experts 資料夾，把檔案複製進去。', en: 'In MT4/MT5 choose File → Open Data Folder, open Experts and copy the file in.' },
      { zh: '回到導航器，在「智能交易系統」按右鍵選「重新整理」。', en: 'In the Navigator, right-click "Expert Advisors" and choose Refresh.' },
    ],
  },
  {
    chapter: 2,
    title: { zh: '步驟 3：確認 EA 設定', en: 'Step 3: Check the EA inputs' },
    visual: InputsPreview,
    lines: [
      { zh: '把 EA 拖到圖表上，確認 AccountLabel、SupabaseUrl、SupabaseKey 和 BridgeKey 都已有內容。', en: 'Drag the EA onto a chart and check AccountLabel, SupabaseUrl, SupabaseKey and BridgeKey are filled in.' },
    ],
  },
  {
    chapter: 2,
    title: { zh: '步驟 4：允許 EA 連線到網站', en: 'Step 4: Allow the EA to reach the website' },
    visual: WebRequestPreview,
    lines: [
      { zh: '按「工具 → 選項 → 智能交易系統」，勾選允許 WebRequest，貼上設定指南的地址。', en: 'Go to Tools → Options → Expert Advisors, allow WebRequest and paste the address from the guide.' },
      { zh: '如果漏了這一步，EA 會被阻擋，無法傳送資料。', en: 'Skip this and MT4/MT5 will block the EA from sending data.' },
    ],
  },
  {
    chapter: 2,
    title: { zh: '步驟 5：開啟自動交易', en: 'Step 5: Turn on AutoTrading' },
    visual: RunningPreview,
    lines: [
      { zh: '按「自動交易」變成綠色，專家分頁會顯示 LiveBridge v2.8 initialized。', en: 'Turn AutoTrading green. The Experts tab shows "LiveBridge v2.8 initialized".' },
      { zh: '網站上的帳戶會變成 Online，並自動上載歷史、IP 地址和完整品種清單。', en: 'The account turns Online and uploads its history, IP address and full symbol list.' },
    ],
  },
  {
    chapter: 2,
    title: { zh: '常見問題', en: 'Troubleshooting' },
    visual: ErrorLogPreview,
    lines: [
      { zh: '一直顯示 Offline 或出現錯誤 4060、4014：檢查第 4 步的地址。', en: 'Stuck Offline, or error 4060 or 4014: check the address from step 4.' },
      { zh: '沒有品種清單：請重新下載並安裝 v2.7 EA。', en: 'No symbol list: download and install the v2.7 EA again.' },
      { zh: '需要 24 小時跟單：建議使用雲端電腦（VPS）。', en: 'Copying 24/7: a cloud computer (VPS) is recommended.' },
    ],
  },
  {
    chapter: 3,
    title: { zh: 'Copy Pairs 跟單配對', en: 'Copy Pairs' },
    visual: PairListPreview,
    lines: [
      { zh: '每一行是一對主帳戶和跟單帳戶，Waiting setup 的會排在最前面。', en: 'Each row is a master and follower pair. Pairs waiting for setup are listed first.' },
      { zh: '可按狀態篩選或搜尋，按「Configure」或「Edit」打開設定。', en: 'Filter by status or search, then click "Configure" or "Edit" to open the settings.' },
    ],
  },
  {
    chapter: 3,
    title: { zh: '手數計算', en: 'Lot sizing' },
    visual: LotModePreview,
    lines: [
      { zh: 'Multiplier 按倍數，Fixed 固定手數，Ratio 按兩個帳戶的結餘比例。', en: 'Multiplier scales lots, Fixed uses one size, Ratio follows the balance ratio.' },
      { zh: 'Max Lot 是重要的安全上限，請按跟單帳戶的資金設定。', en: 'Max Lot is an important safety cap. Set it to suit the follower’s funds.' },
    ],
  },
  {
    chapter: 3,
    title: { zh: '交易選項', en: 'Trade options' },
    visual: TradeOptionsPreview,
    lines: [
      { zh: 'Reverse Trade 反向跟單，Copy Pending 連掛單一起跟。', en: 'Reverse Trade copies in the opposite direction. Copy Pending includes pending orders.' },
      { zh: 'Copy Stop Loss / Take Profit 可以關閉，Max Open Trades 限制同時跟單數量。', en: 'Stop loss and take profit copying can be turned off. Max Open Trades caps open copies.' },
    ],
  },
  {
    chapter: 3,
    title: { zh: 'Symbol Mapping 品種對應', en: 'Symbol Mapping' },
    visual: SymbolMappingPreview,
    lines: [
      { zh: '兩個帳戶的完整品種清單已預先載入，輸入時可直接選擇。', en: 'Both accounts’ full symbol lists are preloaded, so you can pick names as you type.' },
      { zh: '按 Auto-match 自動配對，例如 XAUUSD 配 GOLD。', en: 'Click Auto-match to pair names automatically, like XAUUSD with GOLD.' },
      { zh: '也可用通用規則加減前綴或後綴。預覽中黃色的名稱請再三確認。', en: 'General rules can add or remove prefixes and suffixes. Double-check names shown in yellow.' },
      { zh: '設定好後按「Save Settings」，數秒內生效。', en: 'Click "Save Settings" and it applies within seconds.' },
    ],
  },
  {
    chapter: 3,
    title: { zh: 'Copy Groups 跟單組別', en: 'Copy Groups' },
    visual: CopyGroupPreview,
    lines: [
      { zh: '以主帳戶分組，一眼看清每個團隊有哪些跟單帳戶。', en: 'Followers are grouped by master so you can see each team at a glance.' },
      { zh: '可為組別命名，例如「飛虎隊」，並按「Add follower」加入新帳戶。', en: 'Name a group, such as "Flying Tigers", and use "Add follower" to add accounts.' },
    ],
  },
  {
    chapter: 4,
    title: { zh: 'Friday Close Protection 週五收市保護', en: 'Friday Close Protection' },
    visual: FridayClosePreview,
    lines: [
      { zh: 'Trading Rules 交易規則套用到所有帳戶，控制甚麼時間可以跟單。', en: 'Trading Rules apply to every account and control when copying is allowed.' },
      { zh: '週五收市前停止開新倉，避免週末跳空。冬令時建議把收市時間改為 22。', en: 'New trades stop before the Friday close. In winter, consider a close hour of 22.' },
    ],
  },
  {
    chapter: 4,
    title: { zh: 'Weekend Pause 週末暫停', en: 'Weekend Pause' },
    visual: WeekendPausePreview,
    lines: [
      { zh: '週六和週日全日暫停所有跟單訊號，一般建議保持開啟。', en: 'All copy signals pause on Saturday and Sunday. Keeping it on is recommended.' },
    ],
  },
  {
    chapter: 4,
    title: { zh: 'Crypto Symbols 加密貨幣', en: 'Crypto Symbols' },
    visual: CryptoSymbolsPreview,
    lines: [
      { zh: '加入這裡的加密貨幣品種，週末照樣跟單。', en: 'Crypto symbols listed here keep copying at weekends.' },
    ],
  },
  {
    chapter: 4,
    title: { zh: 'Signal Max Age 訊號有效時間', en: 'Signal Max Age' },
    visual: SignalMaxAgePreview,
    lines: [
      { zh: '超過這段時間仍未執行的訊號會自動作廢，避免以過時價格追單。', en: 'Signals not executed in time expire, so followers never chase stale prices.' },
    ],
  },
  {
    chapter: 4,
    title: { zh: '儲存規則', en: 'Save the rules' },
    visual: SaveSettingsPreview,
    lines: [
      { zh: '修改後按「Save rules」，看到「Saved」即代表已生效。', en: 'Click "Save rules". When "Saved" appears, the changes are live.' },
    ],
  },
  {
    chapter: 5,
    title: { zh: 'Trade History 交易記錄', en: 'Trade History' },
    visual: HistoryFiltersPreview,
    lines: [
      { zh: 'Dashboard 和 Live Positions 即時顯示持倉、浮動盈虧和跟單延遲。', en: 'Dashboard and Live Positions show open trades, floating P&L and copy delay in real time.' },
      { zh: 'History 可按帳戶、品種和時段篩選，並匯出 Excel。', en: 'History filters by account, symbol and period, and exports to Excel.' },
    ],
  },
  {
    chapter: 5,
    title: { zh: 'EA Health', en: 'EA Health' },
    visual: EaHealthPreview,
    lines: [
      { zh: 'EA Health 檢查每個 EA 是否正常，有問題的會顯示 Check 或 Problem。', en: 'EA Health checks every EA. Anything wrong shows as Check or Problem.' },
      { zh: '展開可看到修正步驟，Quick login 快捷登入可一鍵複製 IP 和登入資料。', en: 'Expand a row for fix steps. Quick login copies the IP and login details in one click.' },
    ],
  },
  {
    chapter: 5,
    title: { zh: '甩單警報', en: 'Missed copy alarm' },
    visual: MissedAlarmPreview,
    lines: [
      { zh: '跟單開倉或平倉失敗時，每個頁面頂部都會出現紅色警報並響起警報聲。', en: 'If a copy fails to open or close, a red alarm appears on every page with a sound.' },
      { zh: '打開網站後先按一下畫面，警報聲才可以播放。', en: 'Click the page once after opening the site so the alarm sound can play.' },
      { zh: '處理好後按綠色「Resume healthy / 恢復正常」。', en: 'When it is fixed, click the green "Resume healthy" button.' },
    ],
  },
  {
    chapter: 6,
    title: { zh: 'Signals 交易信號', en: 'Signals' },
    visual: SignalsPreview,
    lines: [
      { zh: '客戶可以瀏覽所有信號，按增長、回撤、時間或淨值排序。', en: 'Clients can browse every signal and sort by growth, drawdown, age or equity.' },
      { zh: '按「申請跟單」填寫聯絡資料，勾選風險聲明後送出。', en: 'Click "Copy this signal", fill in your contact details, tick the risk notice and send.' },
      { zh: '「My applications 我的申請」顯示每個申請的最新狀態。', en: '"My applications" shows the latest status of each request.' },
    ],
  },
  {
    chapter: 6,
    title: { zh: '報告和分享', en: 'Reports and sharing' },
    visual: ReportSharePreview,
    lines: [
      { zh: '每個帳戶都有完整的表現報告，包括盈利、回撤、勝率和每月回報。', en: 'Every account has a full report with profit, drawdown, win rate and monthly returns.' },
      { zh: '按「Share」可分享到 WhatsApp、Telegram 等，或下載分享圖片。', en: 'Click "Share" to post to WhatsApp, Telegram and more, or save a share image.' },
      { zh: '也可列印成 PDF 或下載 Excel。', en: 'You can also print to PDF or download Excel.' },
    ],
  },
  {
    chapter: 7,
    title: { zh: '完成！', en: 'All done!' },
    lines: [
      { zh: '你已了解 MyTrader Tools 的主要功能。下方的手冊有每一步的詳細文字說明。', en: 'You now know the main features of MyTrader Tools. The manual below has full details.' },
      { zh: '祝交易順利！', en: 'Happy trading!' },
    ],
  },
];

export function lineDuration(line: Caption): number {
  return Math.max(3200, line.zh.length * 210, line.en.split(' ').length * 380);
}
