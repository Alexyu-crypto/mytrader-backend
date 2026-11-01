import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { openedFromRecoveryLink, recoveryLinkError, signOutDevice, supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activityLog';

export type Role = 'admin' | 'trader' | 'client' | 'agent' | 'finance' | 'ib_manager' | 'account_opening' | 'broker_files';
export type AuthStatus = 'loading' | 'signed_out' | 'checking' | 'active' | 'no_access' | 'error';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Full admin 全權管理員',
  trader: 'Trader 交易員',
  client: 'Client 客戶',
  agent: 'Agent 代理商',
  finance: 'Finance 出入金',
  ib_manager: 'IB Manager IB 管理員',
  account_opening: 'Account Opening 開戶部',
  broker_files: 'Broker Files 券商檔案部',
};

type Access = { state: 'checking' | 'no_access' | 'error' } | { state: 'active'; role: Role };

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [access, setAccess] = useState<Access>({ state: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const [recovering, setRecovering] = useState(openedFromRecoveryLink || !!recoveryLinkError);

  useEffect(() => {
    // A stalled session refresh must not keep the loading screen up forever.
    const giveUp = setTimeout(() => setReady(true), 10_000);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setReady(true);
      })
      .catch((err) => {
        console.error('session check failed', err);
        setReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(next);
      setReady(true);
    });
    return () => {
      clearTimeout(giveUp);
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setAccess({ state: 'checking' });
    supabase
      .from('app_members')
      .select('role, status')
      .eq('user_id', userId)
      .maybeSingle()
      .abortSignal(AbortSignal.timeout(15_000))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setAccess({ state: 'error' });
        else if (data?.status === 'active' && ['admin', 'trader', 'client', 'agent', 'finance', 'ib_manager', 'account_opening', 'broker_files'].includes(data.role)) setAccess({ state: 'active', role: data.role as Role });
        else setAccess({ state: 'no_access' });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const status: AuthStatus = !ready ? 'loading' : !session ? 'signed_out' : access.state;
  const role: Role | null = session && access.state === 'active' ? access.role : null;

  return {
    status,
    role,
    userId: userId ?? '',
    email: session?.user.email ?? '',
    recovering,
    recoveryError: recoveryLinkError,
    finishRecovery: () => {
      setRecovering(false);
      if (window.location.hash.includes('error')) window.location.hash = '/dashboard';
    },
    retry: () => setAttempt((n) => n + 1),
    signOut: async () => {
      await Promise.race([logActivity('sign_out', 'auth'), new Promise((r) => setTimeout(r, 1500))]);
      await signOutDevice();
    },
  };
}
