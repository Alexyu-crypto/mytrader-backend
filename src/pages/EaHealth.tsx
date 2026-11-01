import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, HeartPulse, Layers, PauseCircle, Radio, Undo2, XCircle, BookOpen, Users, Search, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isOnline } from '@/lib/format';
import { serverNow } from '@/lib/serverClock';
import { IconButton } from '@/components/IconButton';
import { useAccounts, useLivePositions } from '@/hooks/useRealtime';
import { useCopyEngine } from '@/hooks/useCopyEngine';
import { useCheckResumes } from '@/hooks/useCheckResumes';
import { applyResumes, diagnoseAccount, heartbeatOf, resumeKey, type AccountHealth, type CopyState, type HealthCheck, type HealthLevel } from '@/lib/eaHealth';
import { MissedCopyPanel } from '@/components/alerts/MissedCopyPanel';
import { TelegramAlertsCard } from '@/components/alerts/TelegramAlertsCard';
import { QuickLoginCard } from '@/components/health/QuickLoginCard';
import { LatencyPanel } from '@/components/health/LatencyPanel';
import { BROKER_LIMITS, CLOUD_LIMITS, LEVEL_TEXT, latencyOf, levelFor } from '@/lib/latency';
import type { MissedCopyAlarm } from '@/hooks/useMissedCopyAlarm';
import type { Account } from '@/lib/types';

const LEVEL_STYLE: Record<HealthLevel, { text: string; bg: string; label: string; Icon: typeof CheckCircle2 }> = {
  ok: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Healthy', Icon: CheckCircle2 },
  warn: { text: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Check', Icon: AlertTriangle },
  error: { text: 'text-red-400', bg: 'bg-red-500/10', label: 'Problem', Icon: XCircle },
  idle: { text: 'text-slate-500', bg: 'bg-slate-700/30', label: 'Idle', Icon: CircleDashed },
};

const ORDER: Record<HealthLevel, number> = { error: 0, warn: 1, idle: 2, ok: 3 };

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const COPY_STATE_REFRESH_MS = 15_000;

function useFollowerCopyStates() {
  const [states, setStates] = useState<Map<string, CopyState> | null>(null);
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('copy_settings').select('follower_account, enabled');
      if (error || !data) return;
      const next = new Map<string, CopyState>();
      for (const row of data as { follower_account: string; enabled: boolean }[]) {
        if (row.enabled) next.set(row.follower_account, 'copying');
        else if (!next.has(row.follower_account)) next.set(row.follower_account, 'paused');
      }
      setStates(next);
    };
    load();
    const id = setInterval(load, COPY_STATE_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  return states;
}

function isProblem(c: HealthCheck) {
  return c.level === 'warn' || c.level === 'error';
}

function ResumeButton({ onClick, label = 'Resume healthy · 標記為正常', size = 'sm' }: { onClick: () => void; label?: string; size?: 'sm' | 'md' }) {
  return (
    <IconButton label={label} tone="green" size={size} onClick={onClick}>
      <HeartPulse className={size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
    </IconButton>
  );
}

function CheckRow({ check, account, showLogin, onResume, onUndo }: { check: HealthCheck; account: Account; showLogin: boolean; onResume: () => void; onUndo: () => void }) {
  const [open, setOpen] = useState(false);
  const style = LEVEL_STYLE[check.level];
  const hasFixes = !!check.fixes?.length && check.level !== 'ok';

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-3">
        <style.Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.text}`} />
        <div className="flex-1 min-w-[160px]">
          <p className="text-slate-400 text-xs">{check.label}</p>
          <p className={`text-sm mt-0.5 ${check.level === 'idle' || check.resumed ? 'text-slate-500' : 'text-white'}`}>
            {check.resumed && <span className="text-emerald-400 font-medium">Resumed · 已恢復 — </span>}
            {check.summary}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasFixes && (
            <IconButton label={open ? 'Hide fix steps · 收起修復方法' : 'How to fix · 修復方法'} tone={open ? 'cyan' : 'ghost'} onClick={() => setOpen(!open)}>
              <Wrench className="w-3.5 h-3.5" />
            </IconButton>
          )}
          {isProblem(check) && <ResumeButton onClick={onResume} />}
          {check.resumed && (
            <IconButton label="Undo resume · 復原" tone="ghost" onClick={onUndo}>
              <Undo2 className="w-3.5 h-3.5" />
            </IconButton>
          )}
        </div>
      </div>
      {hasFixes && open && showLogin && <QuickLoginCard account={account} />}
      {hasFixes && open && (
        <ol className="mt-3 ml-7 space-y-1.5 list-decimal list-inside text-sm text-slate-300 leading-6 bg-slate-900/60 border border-slate-700 rounded-lg p-3">
          {check.fixes!.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ol>
      )}
    </li>
  );
}

function LatencyLine({ account }: { account: Account }) {
  const { broker, cloud, fresh, reported } = latencyOf(account, Date.now());
  if (!isOnline(account.last_seen)) return null;
  if (!fresh) return <p className="text-xs text-slate-500 mt-0.5">{reported ? 'Latency: waiting' : 'Latency: needs EA v2.7'}</p>;
  return (
    <p className="text-xs mt-0.5 tabular-nums">
      <span className="text-slate-500">Broker </span>
      <span className={LEVEL_TEXT[levelFor(broker, BROKER_LIMITS)]}>{broker === null ? '--' : `${broker} ms`}</span>
      <span className="text-slate-500"> · Cloud </span>
      <span className={LEVEL_TEXT[levelFor(cloud, CLOUD_LIMITS)]}>{cloud === null ? '--' : `${cloud} ms`}</span>
    </p>
  );
}

const RANK: Record<HealthLevel, number> = { error: 3, warn: 2, ok: 1, idle: 0 };

function mainIssue(checks: HealthCheck[]): HealthCheck | null {
  const worst = checks.reduce((w, c) => (RANK[c.level] > RANK[w.level] ? c : w), checks[0]);
  return worst.level === 'error' || worst.level === 'warn' ? worst : null;
}

function AccountRow({
  health,
  showLogin,
  onResume,
  onUndo,
}: {
  health: AccountHealth;
  showLogin: boolean;
  onResume: (labels: string[]) => void;
  onUndo: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { account, level, checks } = health;
  const style = LEVEL_STYLE[level];
  const heartbeat = heartbeatOf(health);
  const online = heartbeat.level === 'ok' && !heartbeat.resumed;
  const paused = checks[0].paused ? checks[0] : null;
  const issue = mainIssue(checks);
  const problems = checks.filter(isProblem);

  return (
    <li className={`transition-colors ${open ? 'bg-slate-800/70' : 'hover:bg-slate-800/40'}`}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full text-left grid grid-cols-[1fr_auto_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,2fr)_7rem_1.5rem] items-center gap-3 md:gap-4 px-4 py-3"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-white text-sm font-medium truncate">{account.account_name}</span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5 truncate pl-4">
            {account.broker} - {account.platform} - <span className="capitalize">{account.type}</span>
          </p>
        </div>
        <div className="hidden md:block min-w-0">
          <p className={`text-sm truncate ${online ? 'text-slate-300' : 'text-slate-500'}`}>{heartbeat.summary}</p>
          <LatencyLine account={account} />
        </div>
        <p className={`hidden md:block text-sm truncate ${issue ? LEVEL_STYLE[issue.level].text : 'text-slate-500'}`}>
          {paused ? paused.summary : issue ? `${issue.label}: ${issue.summary}` : 'All checks passing'}
        </p>
        {paused ? (
          <span className="inline-flex items-center justify-self-start gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700/40 text-slate-300">
            <PauseCircle className="w-3.5 h-3.5" />
            Paused
          </span>
        ) : (
          <span className={`inline-flex items-center justify-self-start gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
            <style.Icon className="w-3.5 h-3.5" />
            {style.label}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 md:pl-8">
          {problems.length > 1 && (
            <div className="flex justify-end mb-3">
              <ResumeButton onClick={() => onResume(problems.map((c) => c.label))} label={`Resume all ${problems.length} checks · 全部標記為正常`} />
            </div>
          )}
          <ul className="divide-y divide-slate-700/50">
            {checks.map((c) => (
              <CheckRow key={c.label} check={c} account={account} showLogin={showLogin} onResume={() => onResume([c.label])} onUndo={() => onUndo(c.label)} />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

interface IssueGroupData {
  key: string;
  level: HealthLevel;
  title: string;
  rows: AccountHealth[];
}

const BORDER: Record<HealthLevel, string> = {
  error: 'border-red-500/60',
  warn: 'border-amber-500/60',
  idle: 'border-slate-600',
  ok: 'border-emerald-500/60',
};

const CALM_TITLE: Partial<Record<HealthLevel, string>> = {
  ok: 'Healthy · 正常運作',
  idle: 'Idle or paused · 閒置或暫停',
};

function issueKey(issue: HealthCheck): string {
  const kind = issue.summary === 'Never connected' ? 'never' : issue.summary.includes('EA is offline') ? 'offline' : '';
  return `${issue.level}|${issue.label}|${kind}`;
}

function issueTitle(issue: HealthCheck): string {
  return issue.label === 'Connection speed' ? 'Connection speed: slow · 連線較慢' : `${issue.label}: ${issue.summary}`;
}

function IssueGroup({
  group,
  showLogin,
  onResumeRow,
  onUndoRow,
  onResumeGroup,
}: {
  group: IssueGroupData;
  showLogin: boolean;
  onResumeRow: (r: AccountHealth, labels: string[]) => void;
  onUndoRow: (r: AccountHealth, label: string) => void;
  onResumeGroup: () => void;
}) {
  const [open, setOpen] = useState(false);
  const style = LEVEL_STYLE[group.level];
  const isIssue = group.level === 'error' || group.level === 'warn';
  const names = group.rows.slice(0, 3).map((r) => r.account.account_name).join(', ');
  const more = group.rows.length - 3;

  return (
    <li className={open ? 'bg-slate-900/40' : ''}>
      <div className={`flex flex-wrap items-center gap-3 px-4 py-3 border-l-2 ${BORDER[group.level]}`}>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex flex-1 min-w-[220px] items-center gap-3 text-left group">
          <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${style.bg}`}>
            <Layers className={`w-4 h-4 ${style.text}`} />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-medium ${style.text}`}>
                {group.title}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${style.bg} ${style.text}`}>{group.rows.length} {group.rows.length === 1 ? 'account' : 'accounts'}</span>
            </span>
            <span className="block text-xs text-slate-500 truncate mt-0.5">
              {names}
              {more > 0 && ` +${more}`}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          {isIssue && <ResumeButton onClick={onResumeGroup} label={`Resume these ${group.rows.length} · 整組標記為正常`} />}
          <button
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
          >
            {open ? 'Hide · 收起' : `Show all ${group.rows.length} · 顯示全部`}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {open && (
        <ul className="divide-y divide-slate-700/50 border-t border-slate-700/60 animate-fade-in">
          {group.rows.map((r) => (
            <AccountRow key={r.account.id} health={r} showLogin={showLogin} onResume={(labels) => onResumeRow(r, labels)} onUndo={(label) => onUndoRow(r, label)} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Stat({ label, value, tone, Icon }: { label: string; value: number; tone: string; Icon: typeof Activity }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-slate-400 text-sm font-medium">{label}</p>
        <Icon className={`w-4 h-4 ${tone}`} />
      </div>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

export function EaHealth({ alarm, showLogin }: { alarm: MissedCopyAlarm; showLogin: boolean }) {
  const { accounts, loading } = useAccounts();
  const { positions } = useLivePositions();
  const { signals } = useCopyEngine();
  const now = useNow(1000);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [query, setQuery] = useState('');
  const { resumes, resume, undo } = useCheckResumes();
  const copyStates = useFollowerCopyStates();

  const results = useMemo(
    () =>
      accounts
        .map((a) => applyResumes(diagnoseAccount(a, positions, signals, now, copyStates ? copyStates.get(a.account_name) ?? 'unlinked' : 'copying'), resumes))
        .sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.account.account_name.localeCompare(b.account.account_name)),
    [accounts, positions, signals, now, resumes, copyStates],
  );

  const resumeRow = (r: AccountHealth, labels: string[]) => resume(labels.map((l) => resumeKey(r.account.account_name, l)));
  const undoRow = (r: AccountHealth, label: string) => undo(resumeKey(r.account.account_name, label));

  const resumeAll = () =>
    resume(results.flatMap((r) => r.checks.filter(isProblem).map((c) => resumeKey(r.account.account_name, c.label))));

  const online = results.filter((r) => isOnline(r.account.last_seen)).length;
  const pausedCount = results.filter((r) => r.checks[0]?.paused).length;
  const issues = results.filter((r) => r.level === 'error' || r.level === 'warn').length;
  const never = results.filter((r) => !r.account.last_seen).length;
  const q = query.trim().toLowerCase();
  const visible = results.filter(
    (r) =>
      (!issuesOnly || r.level === 'error' || r.level === 'warn') &&
      (!q || `${r.account.account_name} ${r.account.broker} ${r.account.platform}`.toLowerCase().includes(q)),
  );

  const grouped = new Map<string, IssueGroupData>();
  for (const r of visible) {
    const issue = r.level === 'error' || r.level === 'warn' ? mainIssue(r.checks) : null;
    const key = issue ? issueKey(issue) : `calm|${r.level}`;
    const title = issue ? issueTitle(issue) : CALM_TITLE[r.level] ?? LEVEL_STYLE[r.level].label;
    const g = grouped.get(key);
    if (g) g.rows.push(r);
    else grouped.set(key, { key, level: issue?.level ?? r.level, title, rows: [r] });
  }
  const groups = [...grouped.values()].sort((a, b) => ORDER[a.level] - ORDER[b.level] || b.rows.length - a.rows.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">EA Health</h1>
          <p className="text-slate-400 text-sm mt-1">Live check of every MT4/MT5 EA. Updates automatically.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {issues > 0 && <ResumeButton onClick={resumeAll} size="md" label={`Resume all to healthy (${issues}) · 全部標記為正常`} />}
          <div className="flex max-w-full flex-wrap items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                onClick={() => setIssuesOnly(v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  issuesOnly === v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {v ? `Needs attention (${issues})` : `All (${results.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="EAs online" value={online} tone="text-emerald-400" Icon={Radio} />
        <Stat label="Needs attention" value={issues} tone={issues ? 'text-amber-400' : 'text-slate-300'} Icon={AlertTriangle} />
        <Stat label="Never connected" value={never} tone={never ? 'text-red-400' : 'text-slate-300'} Icon={XCircle} />
        <Stat label="Total accounts" value={results.length} tone="text-white" Icon={Activity} />
      </div>
      {pausedCount > 0 && (
        <p className="flex items-center gap-2 text-xs text-slate-400 -mt-2">
          <PauseCircle className="w-3.5 h-3.5" />
          {pausedCount} paused or unlinked followers are not raising alerts · 已暫停或未連接的跟單帳戶不會發出警示
        </p>
      )}

      <MissedCopyPanel alarm={alarm} />
      {!loading && results.length > 0 && <LatencyPanel accounts={accounts} now={now} showVps={showLogin} />}
      {showLogin && <TelegramAlertsCard />}

      {loading ? (
        <div className="text-slate-400 text-center py-12">Checking accounts...</div>
      ) : results.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-10 text-center">
          <Users className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-white font-medium mt-3">No accounts yet</p>
          <p className="text-slate-400 text-sm mt-1">Add an account and install its EA to see its health here.</p>
          <a href="#/accounts" className="inline-block mt-4 bg-cyan-500 hover:bg-cyan-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Go to Accounts
          </a>
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-700">
            <label className="relative block max-w-sm">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search account, broker or platform"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </label>
          </div>
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,2fr)_7rem_1.5rem] gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide border-b border-slate-700">
            <span>Account</span>
            <span>Last update · Latency</span>
            <span>Main issue</span>
            <span>Status</span>
            <span />
          </div>
          {visible.length === 0 ? (
            q ? (
              <p className="text-slate-400 text-sm text-center py-10">No accounts match "{query}"</p>
            ) : (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <p className="text-white font-medium mt-3">All EAs are healthy</p>
              </div>
            )
          ) : (
            <ul className="divide-y divide-slate-700/60">
              {groups.map((g) => (
                <IssueGroup
                  key={g.key}
                  group={g}
                  showLogin={showLogin}
                  onResumeRow={resumeRow}
                  onUndoRow={undoRow}
                  onResumeGroup={() => resume(g.rows.flatMap((r) => r.checks.filter(isProblem).map((c) => resumeKey(r.account.account_name, c.label))))}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <a
        href="#/manual"
        className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 hover:border-cyan-500/40 rounded-xl p-4 transition-colors group"
      >
        <BookOpen className="w-5 h-5 text-cyan-400" />
        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
          Setting up a new EA? Follow the step-by-step guide in the User Manual.
        </span>
      </a>
    </div>
  );
}
