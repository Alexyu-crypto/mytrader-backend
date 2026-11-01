import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Hash, KeyRound, Loader2, Monitor, Pencil, Server, TerminalSquare } from 'lucide-react';
import { fetchAccountAccess, loginNumber, resolveLoginIp, type AccountAccess } from '@/lib/accountCredentials';
import { timeAgo } from '@/lib/format';
import type { Account } from '@/lib/types';
import { Hint, IconButton } from '@/components/IconButton';

function Field({ icon: Icon, label, value, secret, note }: { icon: typeof Hash; label: string; value: string; secret?: boolean; note?: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-700/70 rounded-lg px-3 py-2 min-w-0">
      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          {label}
          {note && <span className="ml-1.5 normal-case tracking-normal text-emerald-400">{note}</span>}
        </p>
        <p className={`font-mono text-sm truncate ${value ? 'text-white' : 'text-slate-600 italic font-sans'}`}>
          {!value ? 'Not saved' : secret && !shown ? '\u2022'.repeat(Math.min(value.length, 12)) : value}
        </p>
      </div>
      {value && secret && (
        <IconButton label={shown ? 'Hide · 隱藏' : 'Show · 顯示'} tone="ghost" onClick={() => setShown(!shown)}>
          {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </IconButton>
      )}
      {value && (
        <IconButton label={copied ? 'Copied · 已複製' : 'Copy · 複製'} tone={copied ? 'green' : 'ghost'} onClick={copy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </IconButton>
      )}
    </div>
  );
}

export function QuickLoginCard({ account }: { account: Account }) {
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAccountAccess(account.id).then((res) => {
      if (cancelled) return;
      setFailed(res.error);
      setAccess({ password: res.password, ip_address: res.ip_address, detected_ip: res.detected_ip, detected_ip_at: res.detected_ip_at });
    });
    return () => {
      cancelled = true;
    };
  }, [account.id]);

  return (
    <div className="mt-3 ml-7 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.04] p-3">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">
          <TerminalSquare className="w-4 h-4" /> Quick login 快捷登入
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">{account.platform}</span>
        </p>
        <Hint label="Edit in Accounts · 編輯">
          <a href="#/accounts" aria-label="Edit in Accounts" className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-700/60 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </a>
        </Hint>
      </div>
      {!access ? (
        <p className="flex items-center gap-2 text-slate-400 text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading login details...
        </p>
      ) : failed ? (
        <p className="text-red-400 text-sm py-1">Could not load login details. 未能載入登入資料。</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          <Field
            icon={Monitor}
            label="VPS / IP address"
            value={resolveLoginIp(access)?.ip ?? ''}
            note={resolveLoginIp(access)?.auto ? `auto · ${timeAgo(access.detected_ip_at)}` : undefined}
          />
          <Field icon={Hash} label="Login" value={loginNumber(account.account_name)} />
          <Field icon={Server} label="Server" value={account.broker_server ?? ''} />
          <Field icon={KeyRound} label="Password 密碼" value={access.password} secret />
        </div>
      )}
    </div>
  );
}
