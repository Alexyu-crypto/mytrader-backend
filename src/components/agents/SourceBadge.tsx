import { Building2 } from 'lucide-react';
import { BrandMark } from '@/components/agents/BrandMark';
import type { Agent } from '@/lib/agents';

export const HEAD_OFFICE = 'Head office 總公司';

export function sourceName(agent: Agent | null | undefined): string {
  return agent ? agent.brand_name : HEAD_OFFICE;
}

export function SourceBadge({ agent }: { agent: Agent | null | undefined }) {
  if (!agent) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-600 bg-slate-700/40 px-2 py-0.5 text-[10px] font-medium text-slate-300" title="Signed up on the main site 經總公司頁面註冊">
        <Building2 className="h-3 w-3" />
        {HEAD_OFFICE}
      </span>
    );
  }
  return (
    <span
      className="inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-white"
      style={{ borderColor: `${agent.brand_color}66`, backgroundColor: `${agent.brand_color}1f` }}
      title={`Agent 代理商: ${agent.brand_name} (/a/${agent.slug})`}
    >
      <BrandMark brand={agent} className="h-3.5 w-3.5 rounded text-[8px]" />
      <span className="truncate">{agent.brand_name}</span>
    </span>
  );
}
