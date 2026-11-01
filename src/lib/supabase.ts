import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Read before createClient, which strips the reset-link tokens from the URL.
const initialHash = window.location.hash;
export const openedFromRecoveryLink = /type=recovery/.test(initialHash);
// Never show the text carried in the link: anyone can craft it. Only the fact of the failure is used.
export const recoveryLinkError = /error_code=/.test(initialHash)
  ? 'This link is invalid or has expired · 此連結無效或已過期'
  : null;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// supabase.auth.signOut leaves the local session in place when the server-side session is already gone
// (refresh fails first), so the stored session is wiped by hand as a last resort.
export async function signOutDevice(scope: 'global' | 'local' = 'global', notice?: () => Promise<void>): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut({ scope });
    if (!error) {
      void notice?.();
      return;
    }
    console.error('sign out failed, clearing this device', error);
  } catch (err) {
    console.error('sign out failed, clearing this device', err);
  }
  Object.keys(window.localStorage)
    .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
    .forEach((k) => window.localStorage.removeItem(k));
  await notice?.();
  window.location.reload();
}
