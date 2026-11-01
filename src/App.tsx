import { useState, useEffect, useCallback } from 'react';
import { Layout, PAGE_KEYS, visiblePages, type PageKey } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Accounts, type AccountPrefill } from '@/pages/Accounts';
import { LivePositions } from '@/pages/LivePositions';
import { History } from '@/pages/History';
import { CopyGroupsPage } from '@/pages/CopyGroups';
import { VdsMonitorPage } from '@/pages/VdsMonitor';
import { MetaApiMonitorPage } from '@/pages/MetaApiMonitor';
import { EaHealth } from '@/pages/EaHealth';
import { UserManual } from '@/pages/UserManual';
import { AccountReport } from '@/pages/AccountReport';
import { Landing } from '@/pages/Landing';
import { Strategies } from '@/pages/Strategies';
import { Users } from '@/pages/Users';
import { Signals } from '@/pages/Signals';
import { AgentLanding } from '@/pages/AgentLanding';
import { AgentPortal } from '@/pages/AgentPortal';
import { AgentApply } from '@/pages/AgentApply';
import { Membership } from '@/pages/Membership';
import { FundingPage } from '@/pages/Funding';
import { FundingHistoryPage } from '@/pages/FundingHistory';
import { IbPartnersPage } from '@/pages/IbPartners';
import { AccountOpeningPage } from '@/pages/AccountOpening';
import { RebatesPage } from '@/pages/Rebates';
import { PcSetupPage } from '@/pages/PcSetup';
import { BrokerFilesPage } from '@/pages/BrokerFiles';
import { TradingDesk } from '@/pages/TradingDesk';
import { TraderManager } from '@/pages/TraderManager';
import { useMyBrand } from '@/hooks/useMyBrand';
import { ShareSlugContext } from '@/hooks/useShareSlug';
import { AccessGate } from '@/components/auth/AccessGate';
import { ResetPassword } from '@/components/auth/ResetPassword';
import { useAuth } from '@/hooks/useAuth';
import { useLoginGuard } from '@/hooks/useLoginGuard';
import { useCopyRequests } from '@/hooks/useCopyRequests';
import { useIbFollowUps } from '@/hooks/useIbFollowUps';
import { isOpen } from '@/lib/copyRequests';
import { logActivity } from '@/lib/activityLog';
import { useMissedCopyAlarm } from '@/hooks/useMissedCopyAlarm';
import { useMetaApiSync } from '@/hooks/useMetaApiSync';
import { MissedCopyBanner } from '@/components/alerts/MissedCopyBanner';

function getReportAccount(): string | null {
  const match = window.location.hash.match(/^#\/(?:a\/[a-z0-9-]{3,30}\/)?report\/(.+)$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

const SLUG_ALIASES: Record<string, string> = { followreade: 'royalmaster' };

function getAgentSlug(): string | null {
  const match = window.location.hash.match(/^#\/a\/([a-z0-9-]{3,30})(?:\/?$|\/report\/)/i);
  if (!match) return null;
  const slug = match[1].toLowerCase();
  return SLUG_ALIASES[slug] ?? slug;
}

const isStrategiesHash = () => /^#\/strategies\/?$/i.test(window.location.hash);

function getHashPage(): PageKey {
  const hash = window.location.hash.replace('#/', '').replace('#', '');
  return (PAGE_KEYS.includes(hash as PageKey) ? hash : 'dashboard') as PageKey;
}

function App() {
  const [page, setPage] = useState<PageKey>(getHashPage);
  const [reportAccount, setReportAccount] = useState<string | null>(getReportAccount);
  const [agentSlug, setAgentSlug] = useState<string | null>(getAgentSlug);
  const [strategiesPage, setStrategiesPage] = useState(isStrategiesHash);
  const [accountPrefill, setAccountPrefill] = useState<AccountPrefill | null>(null);
  const clearAccountPrefill = useCallback(() => setAccountPrefill(null), []);
  const auth = useAuth();
  useLoginGuard(auth.userId);
  const myBrand = useMyBrand(auth.status === 'active' && (auth.role === 'agent' || auth.role === 'client'), auth.userId);
  const isAdmin = auth.status === 'active' && auth.role === 'admin';
  const navCopyRequests = useCopyRequests(`nav-copy-requests-${auth.userId}`, isAdmin);
  const isOperator = auth.status === 'active' && !!auth.role && auth.role !== 'client' && auth.role !== 'agent' && auth.role !== 'finance' && auth.role !== 'ib_manager' && auth.role !== 'account_opening' && auth.role !== 'broker_files';
  const missedAlarm = useMissedCopyAlarm(isOperator);
  useMetaApiSync(auth.status === 'active' && (auth.role === 'admin' || auth.role === 'trader'));
  const ibFollowUps = useIbFollowUps(isAdmin || (auth.status === 'active' && auth.role === 'ib_manager'));
  const openCopyRequests = isAdmin ? navCopyRequests.requests.filter((r) => isOpen(r.status)).length : 0;

  useEffect(() => {
    const onHashChange = () => {
      setPage(getHashPage());
      setReportAccount(getReportAccount());
      setAgentSlug(getAgentSlug());
      setStrategiesPage((was) => {
        const now = isStrategiesHash();
        if (now !== was) window.scrollTo(0, 0);
        return now;
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const activeRole = auth.status === 'active' ? auth.role : null;
  useEffect(() => {
    if (!activeRole) return;
    if (reportAccount) {
      logActivity('view_report', 'report', reportAccount);
      return;
    }
    const pages = visiblePages(activeRole);
    logActivity('page_view', 'navigation', pages.includes(page) ? page : pages[0]);
  }, [activeRole, page, reportAccount]);

  const navigate = (p: PageKey) => {
    window.location.hash = `/${p}`;
    setPage(p);
  };

  const shareSlug = myBrand.brand?.slug ?? agentSlug;
  const withShareSlug = (node: JSX.Element) => <ShareSlugContext.Provider value={shareSlug}>{node}</ShareSlugContext.Provider>;

  if (auth.recovering) {
    return <ResetPassword ready={auth.status !== 'loading'} hasSession={auth.status !== 'signed_out' && auth.status !== 'loading'} linkError={auth.recoveryError} onDone={auth.finishRecovery} />;
  }
  if (reportAccount) return withShareSlug(<AccountReport key={`${agentSlug}|${reportAccount}`} accountName={reportAccount} brandSlug={agentSlug} viewerAccess={auth.status === 'active' ? 'member' : auth.status === 'loading' || auth.status === 'checking' ? 'checking' : auth.status === 'no_access' ? 'pending' : 'guest'} />);
  if (auth.status === 'signed_out') {
    if (agentSlug) return <AgentLanding key={agentSlug} slug={agentSlug} />;
    return strategiesPage ? <Strategies /> : <Landing />;
  }
  if (auth.status !== 'active' || !auth.role) return <AccessGate status={auth.status === 'active' ? 'checking' : auth.status} email={auth.email} onRetry={auth.retry} onSignOut={auth.signOut} />;

  const canEdit = auth.role === 'admin' || auth.role === 'trader';
  const scopedView = auth.role === 'client' || auth.role === 'agent';
  const allowed = visiblePages(auth.role);
  const current = allowed.includes(page) ? page : allowed[0];

  return withShareSlug(
    <Layout current={current} onNavigate={navigate} email={auth.email} role={auth.role} onSignOut={auth.signOut} badges={{ users: openCopyRequests, health: isOperator ? missedAlarm.missed.length : 0, ib: ibFollowUps.due }} brand={myBrand.brand}>
      {current === 'dashboard' && <Dashboard canEdit={canEdit} isAdmin={auth.role === 'admin'} />}
      {current === 'signals' && <Signals userId={auth.userId} email={auth.email} showEas={auth.status === 'active' && (auth.role === 'admin' || auth.role === 'trader')} />}
      {current === 'accounts' && <Accounts canEdit={canEdit} prefill={accountPrefill} onPrefillUsed={clearAccountPrefill} />}
      {current === 'positions' && <LivePositions canEdit={canEdit} clientView={scopedView} />}
      {current === 'history' && <History clientView={scopedView} />}
      {current === 'desk' && canEdit && <TradingDesk />}
      {current === 'trader-manager' && canEdit && <TraderManager />}
      {current === 'funding' && <FundingPage />}
      {current === 'funding-history' && <FundingHistoryPage />}
      {current === 'ib' && <IbPartnersPage isAdmin={auth.role === 'admin'} onFollowUpsChanged={ibFollowUps.refresh} />}
      {current === 'opening' && <AccountOpeningPage
          canDelete={auth.role === 'admin' || auth.role === 'ib_manager'}
          onConnectCloud={canEdit && allowed.includes('accounts') ? (r, brokerName) => {
            setAccountPrefill({
              holderName: r.client_name,
              accountNumber: r.account_number,
              broker: brokerName,
              platform: /mt\s*4/i.test(r.account_type) ? 'MT4' : 'MT5',
            });
            navigate('accounts');
          } : undefined}
        />}
      {current === 'rebates' && <RebatesPage isAdmin={auth.role === 'admin'} />}
      {current === 'copy-groups' && <CopyGroupsPage canEdit={canEdit} />}
      {current === 'vds' && <VdsMonitorPage canEdit={canEdit} />}
      {current === 'metaapi' && <MetaApiMonitorPage />}
      {current === 'health' && <EaHealth alarm={missedAlarm} showLogin={auth.status === 'active' && (auth.role === 'admin' || auth.role === 'trader')} />}
      {isOperator && <MissedCopyBanner alarm={missedAlarm} onOpenHealth={() => navigate('health')} />}
      {current === 'pc-setup' && <PcSetupPage isAgent={auth.role === 'agent'} />}
      {current === 'broker-files' && <BrokerFilesPage />}
      {current === 'manual' && <UserManual />}
      {current === 'users' && <Users currentUserId={auth.userId} onAccessChanged={auth.retry} />}
      {current === 'agent' && <AgentPortal userId={auth.userId} onBrandChanged={myBrand.reload} />}
      {current === 'partner' && <AgentApply userId={auth.userId} onRoleChanged={auth.retry} />}
      {current === 'membership' && <Membership onJoin={() => navigate('signals')} />}
    </Layout>
  );
}

export default App;
