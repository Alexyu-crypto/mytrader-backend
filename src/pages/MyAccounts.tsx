import { useCallback, useEffect, useState } from 'react';
import { Plus, Wallet, Loader2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useNotice } from '@/hooks/useConfirm';
import { fetchMyLinkedAccounts } from '@/lib/clientAccounts';
import { formatCurrency, isOnline, timeAgo } from '@/lib/format';
import { RequestAccountDialog } from '@/components/accounts/RequestAccountDialog';
import { AccountRequestsPanel } from '@/components/accounts/AccountRequestsPanel';

interface MyAccount {
  account_name: string;
  broker: string;
  platform: 'MT4' | 'MT5';
  balance: number;
  equity: number;
  last_seen: string | null;
}

export function MyAccountsPage({ role, userId }: { role: 'client' | 'agent'; userId: string | null }) {
  const notify = useNotice();
  const [accounts, setAccounts] = useState<MyAccount[]>([]);
  const [masters, setMasters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const [linked, masterRes] = await Promise.all([
      fetchMyLinkedAccounts(),
      supabase.from('accounts').select('account_name').eq('type', 'master').order('account_name'),
    ]);
    setMasters(masterRes.data ? masterRes.data.map((m) => m.account_name as string) : []);
    let err = linked.error ?? (masterRes.error ? 'Could not load master accounts. 未能載入主帳戶。' : '');
    if (linked.linked.own.length) {
      const { data, error: accErr } = await supabase
        .from('accounts')
        .select('account_name, broker, platform, balance, equity, last_seen')
        .in('account_name', linked.linked.own)
        .order('account_name');
      if (accErr) err = 'Could not load your accounts. 未能載入您的帳戶。';
      setAccounts((data as MyAccount[] | null) ?? []);
    } else {
      setAccounts([]);
    }
    setError(err);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, version]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Accounts 我的帳戶</h1>
          <p className="text-slate-400 text-sm mt-1">
            {role === 'agent' ? 'Your and your clients\u2019 trading accounts 您及旗下客戶的交易帳戶' : 'Your trading accounts 您的交易帳戶'}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-semibold shadow-lg shadow-cyan-500/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add account 新增帳戶
        </button>
      </div>

      <AccountRequestsPanel mode="self" userId={userId} version={version} />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-slate-400 py-10">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading 載入中...
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-slate-700 rounded-xl">
          <Wallet className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">No accounts yet 尚未有帳戶</p>
          <p className="text-slate-500 text-sm mt-1">Press &ldquo;Add account 新增帳戶&rdquo; to submit one for approval. 按「新增帳戶」提交審批。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((a) => {
            const online = isOnline(a.last_seen);
            return (
              <div key={a.account_name} className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-mono text-white text-sm font-semibold break-all">{a.account_name}</p>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    {online ? 'Online 在線' : 'Offline 離線'}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-1 flex items-center gap-1.5">
                  {a.broker} · {a.platform} · <Download className="w-3 h-3" /> EA
                </p>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <p className="text-slate-500 text-xs">Balance 結餘</p>
                    <p className="text-white font-semibold">{formatCurrency(a.balance ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Equity 淨值</p>
                    <p className="text-white font-semibold">{formatCurrency(a.equity ?? 0)}</p>
                  </div>
                </div>
                <p className="text-slate-500 text-xs mt-3">Last seen 最後連線: {timeAgo(a.last_seen)}</p>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <RequestAccountDialog
          isAgent={role === 'agent'}
          masters={masters}
          onClose={() => setShowAdd(false)}
          onSubmitted={() => {
            setShowAdd(false);
            setVersion((v) => v + 1);
            void notify('Submitted. An admin will review it before copying starts. 已提交，管理員批准後才會開始跟單。', { tone: 'success', title: 'Request sent · 已提交' });
          }}
        />
      )}
    </div>
  );
}
