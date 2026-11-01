import { supabase } from '@/lib/supabase';

export interface TelegramStatus {
  connected: boolean;
  enabled: boolean;
  bot_username: string;
  chats: number;
  is_admin: boolean;
}

const MESSAGES: Record<string, string> = {
  invalid_token: 'That bot token is not valid. Copy the full token from @BotFather. 機械人密碼無效，請從 @BotFather 複製完整密碼。',
  no_chat: 'The bot has not received any message yet. Open your bot in Telegram, press Start (or send any message), then try again. 機械人未收到訊息，請先在 Telegram 開啟機械人並按 Start，然後再試。',
  not_connected: 'Telegram is not connected yet. 尚未連接 Telegram。',
  send_failed: 'Telegram did not accept the message. Make sure the bot is not blocked. Telegram 未能送出訊息，請確認未封鎖機械人。',
  forbidden: 'Only full admins can change Telegram alerts. 只有全權管理員可以更改。',
};
const FALLBACK = 'Something went wrong. Please try again. 操作失敗，請再試。';

export async function callTelegramAlerts<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('telegram-alerts', { body });
  if (!error && data?.ok) return { data: data as T, error: null };
  let code = typeof data?.error === 'string' ? data.error : '';
  const ctx = (error as { context?: Response } | null)?.context;
  if (!code && ctx && typeof ctx.json === 'function') {
    const parsed = await ctx.json().catch(() => null);
    if (typeof parsed?.error === 'string') code = parsed.error;
  }
  return { data: null, error: MESSAGES[code] ?? FALLBACK };
}

export async function fetchTelegramStatus(): Promise<{ status: TelegramStatus | null; error: string | null }> {
  const { data, error } = await callTelegramAlerts<TelegramStatus>({ action: 'status' });
  if (error || !data || typeof data.connected !== 'boolean') return { status: null, error: error ?? FALLBACK };
  return { status: data, error: null };
}
