import type { Account } from '@/lib/types';

export type ReconnectPhase = 'waiting_vps' | 'restarting' | 'logging_in' | 'success' | 'failed';

export interface ReconnectState {
  phase: ReconnectPhase;
  label: string;
  detail: string;
}

const VPS_CHECK_MS = 4 * 60_000;
const RESTART_MS = 90_000;
const LOGIN_MS = 3 * 60_000;
const SHOW_RESULT_MS = 10 * 60_000;

const ms = (v: string | null | undefined) => (v ? new Date(v).getTime() : null);

export function reconnectState(acc: Account | undefined, now: number): ReconnectState | null {
  const requested = ms(acc?.reconnect_requested_at);
  if (!acc || requested === null) return null;
  const picked = ms(acc.reconnect_picked_at);
  const done = ms(acc.reconnect_done_at);
  const seen = ms(acc.last_seen);

  if (picked === null) {
    if (now - requested < VPS_CHECK_MS) return { phase: 'waiting_vps', label: '等待 VPS 接收', detail: 'Waiting for the VPS to pick up the request (checks every 2 min)' };
    if (now - requested > VPS_CHECK_MS + SHOW_RESULT_MS) return null;
    return { phase: 'failed', label: '失敗：VPS 沒有回應', detail: 'The VPS did not pick up the request. It may be off, offline, or paused.' };
  }
  if (done === null) {
    if (now - picked < RESTART_MS) return { phase: 'restarting', label: 'VPS 正在重啟 MT', detail: 'The VPS received the request and is restarting MT' };
    if (now - picked > RESTART_MS + SHOW_RESULT_MS) return null;
    return { phase: 'failed', label: '失敗：VPS 未執行重啟', detail: 'The VPS received the request but did not restart MT. Its control program may still be an old version.' };
  }
  if (seen !== null && seen > done) {
    if (now - seen > SHOW_RESULT_MS && now - done > SHOW_RESULT_MS) return null;
    return { phase: 'success', label: '成功：已重新連線', detail: 'MT restarted and the account is connected again' };
  }
  if (now - done < LOGIN_MS) return { phase: 'logging_in', label: 'MT 已重啟，等待登入', detail: 'MT restarted, waiting for the account to log in' };
  if (now - done > LOGIN_MS + SHOW_RESULT_MS) return null;
  return { phase: 'failed', label: '失敗：重啟後仍未連線', detail: 'MT restarted but the account did not connect. Check login, password and broker server.' };
}
