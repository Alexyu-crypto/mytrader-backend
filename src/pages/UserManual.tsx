import { useState } from 'react';
import { Activity, BookOpen, ChevronsUpDown, Clock, Download, Gauge, Layers, MonitorDown, PlayCircle, Radio, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import { ManualFold } from '@/components/manual/ManualParts';
import { PcSetupGuide } from '@/components/manual/sections/PcSetupGuide';
import { TutorialPlayer } from '@/components/manual/tutorial/TutorialPlayer';
import { AccountsGuide } from '@/components/manual/sections/AccountsGuide';
import { SetupGuide } from '@/components/manual/sections/SetupGuide';
import { CopySettingsGuide } from '@/components/manual/sections/CopySettingsGuide';
import { CopyGroupsGuide } from '@/components/manual/sections/CopyGroupsGuide';
import { GlobalSettingsGuide } from '@/components/manual/sections/GlobalSettingsGuide';
import { MonitoringGuide } from '@/components/manual/sections/MonitoringGuide';
import { LatencyGuide } from '@/components/manual/sections/LatencyGuide';
import { ClientGuide } from '@/components/manual/sections/ClientGuide';
import { AdminGuide } from '@/components/manual/sections/AdminGuide';

const SECTIONS = [
  { id: 'accounts', label: '新增和管理帳戶', desc: '單一或批量開戶、IP 自動偵測、報告設定', icon: Users, who: '管理員', Guide: AccountsGuide },
  { id: 'setup-guide', label: '安裝 EA', desc: '五個步驟把 v2.7 EA 連線到網站', icon: Download, who: '管理員', Guide: SetupGuide },
  { id: 'pc-setup', label: 'PC Install Package 電腦安裝包', desc: '一個檔案自動開齊全部 MT、24 小時運行、停電自動重開', icon: MonitorDown, who: '管理員 · 客戶 · 代理商', Guide: PcSetupGuide },
  { id: 'copy-settings', label: 'Copy Settings 跟單設定', desc: '手數、交易選項和品種對應（喺跟單組別頁打開）', icon: SlidersHorizontal, who: '管理員', Guide: CopySettingsGuide },
  { id: 'copy-groups', label: 'Copy Groups 跟單組別', desc: '按主帳戶分組和命名', icon: Layers, who: '管理員', Guide: CopyGroupsGuide },
  { id: 'global-settings', label: 'Trading Rules 交易規則', desc: '控制所有帳戶的跟單時間', icon: Clock, who: '管理員', Guide: GlobalSettingsGuide },
  { id: 'monitoring', label: '監察和警報', desc: '持倉、記錄、EA Health 和甩單警報', icon: Activity, who: '管理員 · 觀察員', Guide: MonitoringGuide },
  { id: 'latency', label: '連線延遲和減少延遲', desc: '睇延遲數字、揀券商伺服器、11 個提速方法', icon: Gauge, who: '管理員 · 交易員', Guide: LatencyGuide },
  { id: 'client', label: '客戶指南', desc: '信號、申請跟單、報告和分享', icon: Radio, who: '客戶 · 代理商', Guide: ClientGuide },
  { id: 'admin', label: '用戶管理和代理商', desc: '角色、批准用戶和代理商後台', icon: ShieldCheck, who: '全權管理員', Guide: AdminGuide },
];

const VIDEO_ID = 'video-tutorial';

export function UserManual() {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const allIds = [VIDEO_ID, ...SECTIONS.map((s) => s.id)];
  const allOpen = allIds.every((id) => open.has(id));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700">
        <img
          src="https://images.pexels.com/photos/38412413/pexels-photo-38412413.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
          alt="多部螢幕顯示交易圖表"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/40" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-cyan-400 text-sm font-medium mb-2">
            <BookOpen className="w-4 h-4" />
            Help center · 說明中心
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">User Manual 使用手冊</h1>
          <p className="text-slate-300 mt-2 leading-relaxed max-w-md text-sm">
            由新增帳戶、安裝 EA、設定跟單，到監察交易、處理警報和客戶申請，一步一步教你使用 MyTrader Tools 的所有功能。撳任何一章打開。
          </p>
          <p className="text-slate-500 text-xs mt-4">相片：Rafael Minguet Delgado / Pexels</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">目錄 · {SECTIONS.length} 章</h2>
        <button
          onClick={() => setOpen(allOpen ? new Set() : new Set(allIds))}
          className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
          {allOpen ? '收起全部' : '展開全部'}
        </button>
      </div>

      <div className="space-y-3">
        <ManualFold id={VIDEO_ID} icon={PlayCircle} label="影片教學" desc="跟住動畫睇一次完整操作流程" open={open.has(VIDEO_ID)} onToggle={() => toggle(VIDEO_ID)}>
          <TutorialPlayer />
        </ManualFold>
        {SECTIONS.map(({ id, label, desc, icon, who, Guide }, i) => (
          <ManualFold key={id} id={`fold-${id}`} index={i + 1} icon={icon} label={label} desc={desc} who={who} open={open.has(id)} onToggle={() => toggle(id)}>
            <Guide />
          </ManualFold>
        ))}
      </div>
    </div>
  );
}
