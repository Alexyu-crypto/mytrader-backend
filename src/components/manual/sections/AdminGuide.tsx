import { ShieldCheck } from 'lucide-react';
import { Callout, Item, SectionHeader, Term } from '@/components/manual/ManualParts';

const ROLES = [
  ['Full admin 全權管理員', '所有頁面和設定，包括用戶管理'],
  ['Trader 交易員', '管理帳戶、跟單設定和交易規則'],
  ['Client 客戶', '信號、自己的持倉和記錄、會員和代理商申請'],
  ['Finance 出入金', '只可使用出入金核對頁面'],
  ['Agent 代理商', '代理商後台、信號、持倉和記錄'],
];

export function AdminGuide() {
  return (
    <section>
      <SectionHeader
        id="admin"
        icon={ShieldCheck}
        title="Admin · 用戶管理 和 Agent Portal"
        audience="全權管理員 · 代理商"
        intro="控制誰可以登入、每個人看到甚麼，以及代理商如何管理自己的客戶。"
      />
      <div className="space-y-4">
        <Item n={1} title="用戶角色">
          <div className="grid sm:grid-cols-2 gap-2">
            {ROLES.map(([role, desc]) => (
              <div key={role} className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                <p className="text-white font-medium">{role}</p>
                <p className="text-slate-400 text-xs mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </Item>

        <Item n={2} title="批准新用戶和更改角色">
          <p>新註冊的用戶會出現在「Waiting for approval 待批准申請」，選擇角色後批准即可登入。已批准的用戶列在「Active users 已啟用用戶」，按角色分組（Full admins、Traders、Clients、Finance、Pending）。</p>
          <Callout tone="warn">如果把自己的角色調低，系統會彈出「Lower your own permission? 降低自己的權限？」提示。確認後你可能無法再進入用戶管理頁。</Callout>
          <p>同一頁亦可處理客戶的跟單申請、查看操作記錄（activity log）和客戶帳戶。</p>
        </Item>

        <Item n={3} title="Agent Portal · 代理商後台">
          <ul className="list-disc pl-5 space-y-1">
            <li><Term>Clients 客戶</Term>：查看和管理自己的客戶。</li>
            <li><Term>Client activity 客戶操作記錄</Term>：客戶最近的操作。</li>
            <li><Term>Branding & logo 品牌及 LOGO</Term>：上載自己的標誌和品牌名稱。</li>
          </ul>
        </Item>
      </div>
    </section>
  );
}
