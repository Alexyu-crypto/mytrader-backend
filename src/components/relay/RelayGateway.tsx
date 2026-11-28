import { useState } from 'react';
import { Download, KeyRound, Loader2, RadioTower } from 'lucide-react';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';
import type { RelayGroup, RelayMember } from '@/lib/relay';

const PROGRAM_FILES = ['relay_gateway.py', 'start_gateway.bat'];

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function RelayGatewayStatus({ group, live }: { group: RelayGroup; live: boolean }) {
  if (live) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200 animate-fade-in">
        <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <span>Relay connected · Relay 已接入 <span className="text-xs text-emerald-300/70">· {timeAgo(group.gateway_seen_at)}</span></span>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
      <RadioTower className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Relay not connected, testing · Relay 未接入，測試中
        {group.gateway_seen_at && <span className="text-xs text-amber-300/70"> · last seen 最後連線 {timeAgo(group.gateway_seen_at)}</span>}
      </span>
    </div>
  );
}

export function RelayGatewaySetup({ group, members, onChanged }: { group: RelayGroup; members: RelayMember[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(false);

  const issueKey = async () => {
    if (group.has_gateway_key && !window.confirm('A new key stops the Gateway that is using the old one. Continue? 新鑰匙會令舊設定檔失效，繼續？')) return;
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('relay_gateway_rotate_key', { p_group_id: group.id });
    setBusy(false);
    if (err || typeof data !== 'string') return setError('Could not create the key. 未能產生鑰匙。');
    const accounts = members
      .filter((m) => m.account_name)
      .map((m) => ({ account_name: m.account_name, role: m.role, login: Number(m.account_name!.match(/\d{5,}/)?.[0] ?? 0), password: '' }));
    const config = {
      supabase_url: supabaseUrl,
      anon_key: supabaseAnonKey,
      gateway_key: data,
      web_terminal_url: 'wss://web.metatrader.app/terminal',
      page_url: '',
      accounts,
    };
    downloadText('gateway_config.json', JSON.stringify(config, null, 2));
    setIssued(true);
    onChanged();
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-700/80 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {PROGRAM_FILES.map((f) => (
          <a
            key={f}
            href={`/downloads/relay-gateway/${f}`}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" /> {f}
          </a>
        ))}
        <button
          onClick={issueKey}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          {group.has_gateway_key ? 'New key + config 重新產生設定檔' : 'Key + config 產生設定檔'}
        </button>
      </div>
      {issued && (
        <p className="mt-2 text-xs text-emerald-300">
          gateway_config.json downloaded. Fill in the two passwords, keep it private. 已下載，填返兩個密碼，唔好俾人。
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
