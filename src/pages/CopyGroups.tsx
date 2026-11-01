import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CandlestickChart, Check, ChevronDown, Loader2, MonitorDown, XCircle, Plus, ChevronsDownUp, ChevronsUpDown, FileSpreadsheet, Pause, Pencil, Play, Repeat, Search, Settings2, Shuffle, Users, Wifi, X } from 'lucide-react';
import { isOnline, timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { PinnedTop } from '@/components/PinnedTop';
import { useAccounts, useLivePositions } from '@/hooks/useRealtime';
import type { Account, CopySettings, LivePosition } from '@/lib/types';
import { ReconnectButton, ReconnectStatus, useReconnect } from '@/components/copy/Reconnect';
import { tradeKey } from '@/lib/copyDelay';
import { ClosePositionDialog } from '@/components/positions/ClosePositionDialog';
import { CloseAllDialog } from '@/components/positions/CloseAllDialog';
import { FollowerPositions } from '@/components/copy/FollowerPositions';
import { CopyGroupImportDialog } from '@/components/copy/CopyGroupImportDialog';
import { hasSymbolRules } from '@/lib/symbolMap';
import { ScrollRows } from '@/components/ScrollRows';
import { CopySettingModal } from '@/components/copy/CopySettingModal';
import { ChangeMasterDialog } from '@/components/copy/ChangeMasterDialog';
import { Hint, IconButton } from '@/components/IconButton';
import { InstallPackageDialog } from '@/components/copy/InstallPackageDialog';
import { ConnectionBadge, connectionShort } from '@/components/ConnectionBadge';
import { useConfirm } from '@/hooks/useConfirm';

interface Group {
  master: string;
  platform: string;
  name: string;
  settings: CopySettings[];
}

const MAX_NAME = 60;

export function CopyGroupsPage({ canEdit }: { canEdit: boolean }) {
  const { accounts } = useAccounts();
  const [settings, setSettings] = useState<CopySettings[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editCell, setEditCell] = useState<{ master: string; follower: string } | null>(null);
  const { positions } = useLivePositions();
  const [confirming, setConfirming] = useState<LivePosition | null>(null);
  const [closing, setClosing] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [changing, setChanging] = useState<Group | null>(null);
  const [packaging, setPackaging] = useState<Group | null>(null);
  const [closingAll, setClosingAll] = useState<Group | null>(null);

  const positionsByAccount = useMemo(() => {
    const map = new Map<string, LivePosition[]>();
    for (const p of positions) {
      const list = map.get(p.account_name);
      if (list) list.push(p);
      else map.set(p.account_name, [p]);
    }
    return map;
  }, [positions]);

  const positionKeys = positions.map((p) => tradeKey(p.account_name, p.ticket)).sort().join(',');
  useEffect(() => {
    setClosing((prev) => {
      const live = new Set(positionKeys.split(','));
      const next = new Set([...prev].filter((k) => live.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [positionKeys]);

  const load = useCallback(async () => {
    const [s, g] = await Promise.all([
      supabase.from('copy_settings').select('*'),
      supabase.from('copy_groups').select('master_account, name'),
    ]);
    if (s.error || g.error) setError('Could not load copy groups. Please refresh and try again.');
    else {
      setError('');
      setSettings((s.data ?? []) as CopySettings[]);
      setNames(new Map((g.data ?? []).map((r) => [r.master_account as string, r.name as string])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const followerNames = useMemo(() => accounts.filter((a) => a.type === 'follower').map((a) => a.account_name).sort(), [accounts]);
  const onlineAccounts = useMemo(() => new Set(accounts.filter((a) => isOnline(a)).map((a) => a.account_name)), [accounts]);
  const accountByName = useMemo(() => new Map(accounts.map((a) => [a.account_name, a])), [accounts]);

  const groups = useMemo(() => {
    const platform = new Map(accounts.map((a) => [a.account_name, a.platform]));
    const masters = new Set([...accounts.filter((a) => a.type === 'master').map((a) => a.account_name), ...settings.map((s) => s.master_account)]);
    const list: Group[] = [...masters].map((master) => ({
      master,
      platform: platform.get(master) ?? '',
      name: names.get(master) ?? '',
      settings: settings.filter((s) => s.master_account === master).sort((a, b) => a.follower_account.localeCompare(b.follower_account)),
    }));
    return list.sort((a, b) => b.settings.length - a.settings.length || a.master.localeCompare(b.master));
  }, [accounts, settings, names]);

  const q = query.trim().toLowerCase();
  const filtered = groups
    .map((g) => {
      if (!q || g.master.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)) return g;
      const hits = g.settings.filter((s) => s.follower_account.toLowerCase().includes(q));
      return hits.length ? { ...g, settings: hits } : null;
    })
    .filter((g): g is Group => g !== null);

  const totalLinks = settings.length;
  const enabledLinks = settings.filter((s) => s.enabled).length;
  const allOpen = filtered.length > 0 && filtered.every((g) => open.has(g.master));
  const isOpen = (g: Group) => open.has(g.master) || (!!q && !g.master.toLowerCase().includes(q) && !g.name.toLowerCase().includes(q));

  const toggle = (master: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(master)) next.delete(master);
      else next.add(master);
      return next;
    });

  const saveName = async (master: string, raw: string) => {
    const name = raw.trim().slice(0, MAX_NAME);
    const { error: err } = name
      ? await supabase.from('copy_groups').upsert({ master_account: master, name, updated_at: new Date().toISOString() })
      : await supabase.from('copy_groups').delete().eq('master_account', master);
    if (err) return 'Could not save the group name. Please try again.';
    setNames((prev) => {
      const next = new Map(prev);
      if (name) next.set(master, name);
      else next.delete(master);
      return next;
    });
    return null;
  };

  const setGroupEnabled = async (master: string, enabled: boolean) => {
    const { error: err } = await supabase.from('copy_settings').update({ enabled }).eq('master_account', master).neq('enabled', enabled);
    if (err) return 'Could not update this group. Please try again. 未能更新，請再試。';
    setSettings((prev) => prev.map((s) => (s.master_account === master ? { ...s, enabled } : s)));
    return null;
  };

  const setPairEnabled = async (id: string, enabled: boolean) => {
    const { error: err } = await supabase.from('copy_settings').update({ enabled }).eq('id', id);
    if (err) return 'Could not update this follower. Please try again. 未能更新，請再試。';
    setSettings((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Copy Groups · 跟單組別</h1>
          <p className="text-slate-400 text-sm mt-1">Every master account and the followers copying it. Click a group to see its followers.</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setImporting(true)}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Import Excel 匯入
          </button>
        )}
      </div>

      <PinnedTop>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['Groups', groups.length, 'text-white'],
          ['Follower links', totalLinks, 'text-white'],
          ['Enabled', enabledLinks, 'text-emerald-400'],
          ['Disabled', totalLinks - enabledLinks, 'text-red-400'],
        ].map(([label, value, tone]) => (
          <div key={label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search group name, master or follower..."
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
        <button
          onClick={() => setOpen(allOpen ? new Set() : new Set(filtered.map((g) => g.master)))}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40"
        >
          {allOpen ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      </PinnedTop>

      {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="text-slate-400 text-center py-8">Loading groups...</div>
      ) : filtered.length === 0 ? (
        <div className="text-slate-500 text-center py-12 border border-dashed border-slate-700 rounded-xl">
          {groups.length === 0 ? 'No master accounts yet.' : 'No groups match your search.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => (
            <GroupCard
              key={g.master}
              group={g}
              open={isOpen(g)}
              canEdit={canEdit}
              followerNames={followerNames}
              positionsByAccount={positionsByAccount}
              onlineAccounts={onlineAccounts}
              accountByName={accountByName}
              closing={closing}
              onClosePosition={setConfirming}
              onToggle={() => toggle(g.master)}
              onRename={(name) => saveName(g.master, name)}
              onSetEnabled={(enabled) => setGroupEnabled(g.master, enabled)}
              onSetPairEnabled={setPairEnabled}
              onEdit={(follower) => setEditCell({ master: g.master, follower })}
              onChangeMaster={() => setChanging(g)}
              onPackage={() => setPackaging(groups.find((x) => x.master === g.master) ?? g)}
              onCloseAll={() => setClosingAll(g)}
            />
          ))}
        </div>
      )}

      {editCell && (
        <CopySettingModal
          master={editCell.master}
          follower={editCell.follower}
          existing={settings.find((s) => s.master_account === editCell.master && s.follower_account === editCell.follower) ?? null}
          onClose={() => setEditCell(null)}
          onSaved={() => {
            setEditCell(null);
            load();
          }}
        />
      )}

      {changing && (
        <ChangeMasterDialog
          oldMaster={changing.master}
          groupName={changing.name}
          accounts={accounts}
          settings={settings}
          groupNames={names}
          openTradesOf={(f) => positionsByAccount.get(f)?.length ?? 0}
          onClose={() => setChanging(null)}
          onDone={(newMaster) => {
            setChanging(null);
            setOpen((prev) => new Set(prev).add(newMaster));
            load();
          }}
        />
      )}

      {packaging && (
        <InstallPackageDialog
          master={packaging.master}
          groupName={packaging.name}
          members={[packaging.master, ...packaging.settings.map((s) => s.follower_account)]
            .map((name) => accounts.find((a) => a.account_name === name))
            .filter((a): a is (typeof accounts)[number] => !!a)}
          onClose={() => setPackaging(null)}
        />
      )}

      {importing && (
        <CopyGroupImportDialog accounts={accounts} settings={settings} groupNames={names} onClose={() => setImporting(false)} onDone={load} />
      )}

      {closingAll && (
        <CloseAllDialog
          account={closingAll.master}
          positions={positionsByAccount.get(closingAll.master) ?? []}
          followerTrades={closingAll.settings.reduce((sum, s) => sum + (positionsByAccount.get(s.follower_account)?.length ?? 0), 0)}
          onClose={() => setClosingAll(null)}
          onQueued={() => {
            const keys = (positionsByAccount.get(closingAll.master) ?? []).map((p) => tradeKey(p.account_name, p.ticket));
            setClosing((prev) => new Set([...prev, ...keys]));
          }}
        />
      )}

      {confirming && (
        <ClosePositionDialog
          position={confirming}
          onClose={() => setConfirming(null)}
          onQueued={() => {
            const key = tradeKey(confirming.account_name, confirming.ticket);
            setClosing((prev) => new Set(prev).add(key));
          }}
        />
      )}
    </div>
  );
}

function GroupCard({
  group,
  open,
  canEdit,
  followerNames,
  positionsByAccount,
  onlineAccounts,
  accountByName,
  closing,
  onClosePosition,
  onToggle,
  onRename,
  onSetEnabled,
  onSetPairEnabled,
  onEdit,
  onChangeMaster,
  onPackage,
  onCloseAll,
}: {
  group: Group;
  open: boolean;
  canEdit: boolean;
  followerNames: string[];
  positionsByAccount: Map<string, LivePosition[]>;
  onlineAccounts: Set<string>;
  accountByName: Map<string, Account>;
  closing: Set<string>;
  onClosePosition: (p: LivePosition) => void;
  onToggle: () => void;
  onRename: (name: string) => Promise<string | null>;
  onSetEnabled: (enabled: boolean) => Promise<string | null>;
  onSetPairEnabled: (id: string, enabled: boolean) => Promise<string | null>;
  onEdit: (follower: string) => void;
  onChangeMaster: () => void;
  onPackage: () => void;
  onCloseAll: () => void;
}) {
  const ask = useConfirm();
  const [switching, setSwitching] = useState<boolean | null>(null);
  const [switchError, setSwitchError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [adding, setAdding] = useState(false);
  const [connSort, setConnSort] = useState<'none' | 'offline' | 'online'>('none');
  const sortedSettings =
    connSort === 'none'
      ? group.settings
      : [...group.settings].sort((a, b) => {
          const diff = Number(onlineAccounts.has(a.follower_account)) - Number(onlineAccounts.has(b.follower_account));
          return connSort === 'offline' ? diff : -diff;
        });
  const enabled = group.settings.filter((s) => s.enabled).length;
  const linked = new Set(group.settings.map((s) => s.follower_account));
  const available = followerNames.filter((f) => !linked.has(f));
  const openTrades = group.settings.reduce((sum, s) => sum + (positionsByAccount.get(s.follower_account)?.length ?? 0), 0);
  const masterOpen = positionsByAccount.get(group.master) ?? [];
  const masterOnline = onlineAccounts.has(group.master);
  const followersOnline = group.settings.filter((s) => onlineAccounts.has(s.follower_account)).length;
  const masterClosing = masterOpen.length > 0 && masterOpen.every((p) => closing.has(tradeKey(p.account_name, p.ticket)));

  const startRename = () => {
    setDraft(group.name);
    setRenameError('');
    setRenaming(true);
  };

  const switchAll = async (on: boolean) => {
    const label = group.name || group.master;
    const msg = on
      ? `Start copying for all ${group.settings.length} followers of ${label}?\n\u6574\u7d44\u958b\u59cb\u8907\u88fd\uff1f`
      : `Stop copying for all ${group.settings.length} followers of ${label}? New trades will not be copied until you start again. Open trades stay open.\n\u6574\u7d44\u505c\u6b62\u8907\u88fd\uff1f`;
    if (!(await ask(msg, on ? { tone: 'info', confirmLabel: 'Start · 開始' } : { tone: 'warning', confirmLabel: 'Stop · 停止' }))) return;
    setSwitching(on);
    setSwitchError('');
    const err = await onSetEnabled(on);
    setSwitching(null);
    if (err) setSwitchError(err);
  };

  const submit = async () => {
    setSaving(true);
    const err = await onRename(draft);
    setSaving(false);
    if (err) setRenameError(err);
    else setRenaming(false);
  };

  return (
    <div className={`bg-slate-800/50 border rounded-xl overflow-hidden transition-colors ${open ? 'border-cyan-500/30' : 'border-slate-700'}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? 'Collapse group' : 'Expand group'}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        </button>

        <div className="flex-1 min-w-[200px]">
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={draft}
                maxLength={MAX_NAME}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
                placeholder="e.g. Flying Tigers · 飛虎隊"
                className="flex-1 min-w-0 bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
              />
              <button type="submit" disabled={saving} aria-label="Save name" className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
                <Check className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setRenaming(false)} aria-label="Cancel" className="p-1.5 rounded-md text-slate-400 hover:bg-slate-700">
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <button onClick={onToggle} className="text-left group">
              <span className={`block font-semibold ${group.name ? 'text-white' : 'text-slate-500 italic'}`}>{group.name || 'Unnamed group'}</span>
              <span className="text-sm text-cyan-400 font-medium">{group.master}</span>
              {group.platform && <span className="text-slate-500 text-xs ml-2">{group.platform}</span>}
              {accountByName.get(group.master) && <span className="ml-2 align-middle"><ConnectionBadge method={accountByName.get(group.master)?.connection_method} /></span>}
              <span
                className={`inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium border align-middle ${
                  masterOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700/40 text-slate-400 border-slate-600/50'
                }`}
              >
                <span className="relative flex w-1.5 h-1.5">
                  {masterOnline && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />}
                  <span className={`relative w-1.5 h-1.5 rounded-full ${masterOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                </span>
                {masterOnline ? 'Online 在線' : 'Offline 離線'}
              </span>
            </button>
          )}
          {renameError && <p className="text-red-400 text-xs mt-1">{renameError}</p>}
          {switchError && <p className="text-red-400 text-xs mt-1">{switchError}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Hint label={`${group.settings.length} followers · 跟單帳戶`}>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 tabular-nums">
              <Users className="w-3.5 h-3.5" />
              {group.settings.length}
            </span>
          </Hint>
          {group.settings.length > 0 && (
            <Hint label={`${followersOnline} of ${group.settings.length} followers online · 跟單帳戶在線`}>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border tabular-nums ${
                  followersOnline === group.settings.length
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : followersOnline === 0
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                {followersOnline}/{group.settings.length}
              </span>
            </Hint>
          )}
          {group.settings.length > 0 && (
            <Hint label={`${enabled} copying · 複製中`}>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tabular-nums">
                <Play className="w-3 h-3 fill-current" />
                {enabled}
              </span>
            </Hint>
          )}
          {openTrades > 0 && (
            <Hint label={`${openTrades} open trades · 持倉`}>
              <button
                onClick={onToggle}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 tabular-nums transition-colors"
              >
                <CandlestickChart className="w-3.5 h-3.5" />
                {openTrades}
              </button>
            </Hint>
          )}
          {canEdit && group.settings.length > 0 && (
            <>
              <IconButton
                label={enabled === 0 ? 'All stopped · 已全部停止' : 'Stop all · 整組停止複製'}
                tone="red"
                onClick={() => switchAll(false)}
                disabled={enabled === 0 || switching !== null}
              >
                <Pause className={`w-3.5 h-3.5 ${switching === false ? 'animate-pulse' : ''}`} />
              </IconButton>
              <IconButton
                label={enabled === group.settings.length ? 'All copying · 已全部開始' : 'Start all · 整組開始複製'}
                tone="green"
                onClick={() => switchAll(true)}
                disabled={enabled === group.settings.length || switching !== null}
              >
                <Play className={`w-3.5 h-3.5 ${switching === true ? 'animate-pulse' : ''}`} />
              </IconButton>
            </>
          )}
          {canEdit && masterOpen.length > 0 && (
            masterClosing ? (
              <Hint label="Closing all · 全部平倉中">
                <span className="inline-flex items-center justify-center w-7 h-7 text-amber-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                </span>
              </Hint>
            ) : (
              <IconButton label={`Close all ${masterOpen.length} orders · 全部平倉`} tone="red" onClick={onCloseAll}>
                <XCircle className="w-3.5 h-3.5" />
              </IconButton>
            )
          )}
          {canEdit && group.settings.length > 0 && (
            <IconButton label="Change master · 一鍵更換主帳戶" tone="cyan" onClick={onChangeMaster}>
              <Repeat className="w-3.5 h-3.5" />
            </IconButton>
          )}
          {canEdit && (
            <IconButton label="PC install package · 電腦安裝包" tone="cyan" onClick={onPackage}>
              <MonitorDown className="w-3.5 h-3.5" />
            </IconButton>
          )}
          {canEdit && !renaming && (
            <IconButton label={group.name ? 'Rename · 改名' : 'Name group · 命名'} tone="slate" onClick={startRename}>
              <Pencil className="w-3.5 h-3.5" />
            </IconButton>
          )}
          {canEdit && (
            <IconButton
              label={available.length === 0 ? 'Every follower already added · 已全部加入' : 'Add follower · 加跟單帳戶'}
              tone={adding ? 'solid' : 'cyan'}
              onClick={() => setAdding((v) => !v)}
              disabled={available.length === 0}
            >
              <Plus className="w-3.5 h-3.5" />
            </IconButton>
          )}
        </div>
      </div>

      {adding && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-slate-700 bg-slate-900/40 animate-fade-in">
          <label htmlFor={`add-${group.master}`} className="text-xs text-slate-400">
            Choose a follower to copy <span className="text-cyan-400">{group.master}</span>
          </label>
          <select
            id={`add-${group.master}`}
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              setAdding(false);
              onEdit(e.target.value);
            }}
            className="flex-1 min-w-[200px] bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="" disabled>
              Select follower account...
            </option>
            {available.map((f) => (
              <option key={f} value={f}>
                {accountByName.get(f)?.platform ? `[${accountByName.get(f)?.platform} · ${connectionShort(accountByName.get(f)?.connection_method)}] ` : ''}{f}
              </option>
            ))}
          </select>
          <button onClick={() => setAdding(false)} className="text-xs text-slate-400 hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      )}

      {open && (
        <div className="border-t border-slate-700 animate-fade-in">
          {group.settings.length === 0 ? (
            <p className="px-4 py-6 text-center text-slate-500 text-sm">No followers configured for this master yet.{canEdit && ' Use the + button above to connect one.'}</p>
          ) : (
            <ScrollRows rows={20}>
              <table className="w-full text-[13px] whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                    <th className="text-left px-3 py-2.5 font-medium">Follower</th>
                    <th className="text-left px-3 py-2.5 font-medium">Status</th>
                    <th className="text-left px-3 py-2.5 font-medium">Mode</th>
                    <th className="text-left px-3 py-2.5 font-medium">Lot Config</th>
                    <th className="text-left px-3 py-2.5 font-medium">Reverse</th>
                    <th className="text-left px-3 py-2.5 font-medium">Symbols</th>
                    <th className="text-left px-3 py-2.5 font-medium">Mapping</th>
                    <th className="text-left px-3 py-2.5 font-medium" aria-sort={connSort === 'none' ? 'none' : connSort === 'online' ? 'descending' : 'ascending'}>
                      <button
                        type="button"
                        onClick={() => setConnSort((v) => (v === 'none' ? 'offline' : v === 'offline' ? 'online' : 'none'))}
                        title={connSort === 'none' ? 'Sort: offline first' : connSort === 'offline' ? 'Sort: online first' : 'Clear sort'}
                        className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-white ${connSort !== 'none' ? 'text-cyan-400' : ''}`}
                      >
                        Connection 連線狀態
                        {connSort === 'offline' ? <ArrowUp className="w-3.5 h-3.5" /> : connSort === 'online' ? <ArrowDown className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />}
                      </button>
                    </th>
                    <th className="text-right px-3 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSettings.map((s) => (
                    <FollowerRow
                      key={s.id}
                      setting={s}
                      canEdit={canEdit}
                      onEdit={() => onEdit(s.follower_account)}
                      onSetEnabled={(enabled) => onSetPairEnabled(s.id, enabled)}
                      positions={positionsByAccount.get(s.follower_account) ?? []}
                      online={onlineAccounts.has(s.follower_account)}
                      account={accountByName.get(s.follower_account)}
                      closing={closing}
                      onClosePosition={onClosePosition}
                    />
                  ))}
                </tbody>
              </table>
            </ScrollRows>
          )}
        </div>
      )}
    </div>
  );
}

function FollowerRow({
  setting: s,
  canEdit,
  onEdit,
  onSetEnabled,
  positions,
  online,
  account,
  closing,
  onClosePosition,
}: {
  setting: CopySettings;
  canEdit: boolean;
  onEdit: () => void;
  onSetEnabled: (enabled: boolean) => Promise<string | null>;
  positions: LivePosition[];
  online: boolean;
  account: Account | undefined;
  closing: Set<string>;
  onClosePosition: (p: LivePosition) => void;
}) {
  const [showTrades, setShowTrades] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const lastSeen = account?.last_seen ?? null;
  const reconnect = useReconnect(s.follower_account, account);
  const floating = positions.reduce((sum, p) => sum + (p.profit || 0), 0);

  return (
    <>
    <tr className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30">
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-amber-400 font-medium">
          {s.follower_account}
          {account && <ConnectionBadge method={account.connection_method} />}
        </span>
        {positions.length > 0 ? (
          <button
            onClick={() => setShowTrades((v) => !v)}
            aria-expanded={showTrades}
            className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border text-cyan-300 bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
          >
            <span className="tabular-nums">{positions.length}</span> open
            <span className={`tabular-nums ${floating >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {floating >= 0 ? '+' : ''}
              {floating.toFixed(2)}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showTrades ? 'rotate-180' : ''}`} />
          </button>
        ) : (
          <span className="block text-slate-500 text-xs mt-0.5">No open trades</span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {s.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-300 capitalize">{s.mode}</td>
      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
        {s.mode === 'fixed' ? `${s.fixed_lot} lot` : `x${s.lot_multiplier}`} (max {s.max_lot})
      </td>
      <td className="px-3 py-2">{s.reverse ? <span className="text-amber-400">Yes</span> : <span className="text-slate-500">No</span>}</td>
      <td
        className="px-3 py-2 text-slate-400 text-xs max-w-[180px] truncate"
        title={[s.allowed_symbols.length > 0 && `Allow: ${s.allowed_symbols.join(', ')}`, s.blocked_symbols.length > 0 && `Block: ${s.blocked_symbols.join(', ')}`].filter(Boolean).join('\n') || undefined}
      >
        {s.allowed_symbols.length > 0 ? `Allow: ${s.allowed_symbols.join(', ')}` : 'All'}
        {s.blocked_symbols.length > 0 && <br />}
        {s.blocked_symbols.length > 0 && `Block: ${s.blocked_symbols.join(', ')}`}
      </td>
      <td className="px-3 py-2 text-slate-400 text-xs">
        {hasSymbolRules(s) ? (
          <span className="inline-flex items-center gap-1 text-cyan-400">
            <Shuffle className="w-3.5 h-3.5" />
            {[
              Object.keys(s.symbol_map).length > 0 && `${Object.keys(s.symbol_map).length} pair(s)`,
              s.strip_suffix && `-${s.strip_suffix}`,
              s.add_prefix && `${s.add_prefix}+`,
              s.add_suffix && `+${s.add_suffix}`,
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
        ) : (
          'Same names'
        )}
        {(!s.copy_sl || !s.copy_tp || s.max_open_trades > 0) && (
          <p className="text-slate-500 mt-0.5">
            {[!s.copy_sl && 'No SL', !s.copy_tp && 'No TP', s.max_open_trades > 0 && `Max ${s.max_open_trades} trades`].filter(Boolean).join(' / ')}
          </p>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
            online ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}
        >
          <span className="relative flex w-1.5 h-1.5">
            {online && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />}
            <span className={`relative w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-red-400'}`} />
          </span>
          {online ? 'Online 在線' : 'Offline 離線'}
        </span>
        {!online && <span className="block text-slate-500 text-xs mt-0.5">{lastSeen ? `Last seen ${timeAgo(lastSeen)}` : 'Never connected'}</span>}
      </td>
      <td className="px-3 py-2 text-right">
        {canEdit && (
          <div className="inline-flex items-center justify-end gap-2">
            <IconButton
              label={s.enabled ? 'Stop · 停止複製' : 'Start · 開始複製'}
              tone={s.enabled ? 'red' : 'green'}
              onClick={async () => {
                setSwitching(true);
                setSwitchError('');
                const err = await onSetEnabled(!s.enabled);
                setSwitching(false);
                if (err) setSwitchError(err);
              }}
              disabled={switching}
            >
              {s.enabled ? <Pause className={`w-3.5 h-3.5 ${switching ? 'animate-pulse' : ''}`} /> : <Play className={`w-3.5 h-3.5 ${switching ? 'animate-pulse' : ''}`} />}
            </IconButton>
            <ReconnectButton control={reconnect} />
            <IconButton label="Edit · 設定" tone="slate" onClick={onEdit}>
              <Settings2 className="w-3.5 h-3.5" />
            </IconButton>
          </div>
        )}
        <ReconnectStatus rc={reconnect.rc} className="mt-1 justify-end" />
        {(switchError || reconnect.error) && <p className="text-red-400 text-xs mt-1">{switchError || reconnect.error}</p>}
      </td>
    </tr>
    {showTrades && positions.length > 0 && (
      <tr className="border-b border-slate-700/50 bg-slate-900/50 animate-fade-in">
        <td colSpan={9} className="p-0 border-l-2 border-cyan-500/40">
          <FollowerPositions positions={positions} closing={closing} canClose={canEdit} onClose={onClosePosition} />
        </td>
      </tr>
    )}
    </>
  );
}
