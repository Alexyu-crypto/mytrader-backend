import { Layers } from 'lucide-react';
import { CopyGroupPreview } from '@/components/manual/AccountPreviews';
import { Callout, Item, SectionHeader, Term } from '@/components/manual/ManualParts';

export function CopyGroupsGuide() {
  return (
    <section>
      <SectionHeader
        id="copy-groups"
        icon={Layers}
        title="Copy Groups · 跟單組別"
        audience="管理員 · 交易員"
        intro="以主帳戶為單位，把跟隨同一個主帳戶的所有跟單帳戶放在一起顯示，方便一眼看清每個團隊的情況。"
      />
      <div className="space-y-4">
        <Item n={1} title="頁面總覽">
          <p>頁面頂部顯示四個數字：<Term>Groups</Term>（組別數量）、<Term>Follower links</Term>（跟單連結總數）、<Term>Enabled</Term> 和 <Term>Disabled</Term>。</p>
          <p>下面每張卡是一個主帳戶，列出所有跟隨它的帳戶，以及每個帳戶的 Status、Mode、Lot Config、Reverse、Symbols 和 Mapping。</p>
          <CopyGroupPreview />
        </Item>
        <Item n={2} title="為組別命名">
          <p>按「Name group」（已有名稱則按「Rename」），輸入名稱後儲存，例如「Flying Tigers · 飛虎隊」，最多 60 個字。名稱會在各頁面顯示，方便辨認。</p>
        </Item>
        <Item n={3} title="加入跟單帳戶或修改設定">
          <p>按「Add follower」選擇要加入的跟單帳戶。按任何一行的「Edit」會打開該對帳戶的跟單設定視窗，內容和 Copy Pairs 頁面一樣。</p>
          <Callout tone="tip">同一個跟單帳戶可以同時跟多個主帳戶，每一對都有獨立設定。</Callout>
        </Item>
        <Item n={4} title="一鍵更換主帳戶">
          <p>按組別右邊的「Change master · 一鍵更換主帳戶」（兩個箭咀圖示），揀新的主帳戶，再按「Move followers」，整組跟單帳戶就會一次過改為跟新主帳戶，手數、品種對應等設定全部保留。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>可以選擇把組別名稱一齊搬去新主帳戶（如果新主帳戶未有名稱）。</li>
            <li>已經跟緊新主帳戶的跟單帳戶會自動略過，留喺原本組別。</li>
            <li>新舊主帳戶平台不同（MT4 / MT5）時會提醒你檢查品種名稱。</li>
          </ul>
          <Callout tone="warn">如果跟單帳戶仍有由舊主帳戶複製的持倉，換咗之後呢啲單未必會跟舊主帳戶自動平倉。建議平倉後先更換。</Callout>
        </Item>
      </div>
    </section>
  );
}
