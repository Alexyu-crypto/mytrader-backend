import { useEffect } from 'react';
import { signOutDevice, supabase } from '@/lib/supabase';
import { useNotice } from '@/hooks/useConfirm';

const CHECK_MS = 5000;

const MESSAGES: Record<string, string> = {
  replaced: 'Your account was signed in on another device, so you have been signed out here.\n你的帳戶已在其他裝置登入，此裝置已自動登出。',
  ip_blocked: 'Sign-in from this network (IP) is not allowed. Please contact the administrator.\n此網絡 (IP) 不允許登入，請聯絡管理員。',
};

export function useLoginGuard(userId: string) {
  const notify = useNotice();

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let running = false;

    let again = false;

    const check = async (): Promise<void> => {
      if (stopped) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      const { data, error } = await supabase.rpc('login_still_valid');
      running = false;
      if (stopped) return;
      if (error) console.error('login check failed', error);
      const message = !error && typeof data === 'string' ? MESSAGES[data] : undefined;
      if (!message) {
        if (again) {
          again = false;
          return check();
        }
        return;
      }
      stopped = true;
      await signOutDevice('local', () => notify(message, { title: 'Signed out · 已登出', tone: 'warning' }));
    };

    check();
    const channel = supabase
      .channel(`session-revocations-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_revocations', filter: `user_id=eq.${userId}` },
        () => void check(),
      )
      .subscribe();
    const timer = setInterval(check, CHECK_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      void supabase.removeChannel(channel);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, notify]);
}
