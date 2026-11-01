import { EyeOff, Lock } from 'lucide-react';
import type { Account } from '@/lib/types';

export const isReadOnlyLogin = (a: Pick<Account, 'mt_trade_allowed'> | undefined | null) => a?.mt_trade_allowed === false;

const TIP = 'Logged in with the investor (read-only) password. Orders will be refused until you log in with the main trading password. 正使用投資者（唯讀）密碼登入，下單會被拒絕，請改用主交易密碼登入。';

export function ReadOnlyBadge({ account, compact = false }: { account: Pick<Account, 'mt_trade_allowed'> | undefined | null; compact?: boolean }) {
  if (!isReadOnlyLogin(account)) return null;
  if (compact) {
    return (
      <span title={TIP} aria-label="Read-only login 唯讀登入" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/40">
        <Lock className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span title={TIP} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-500/40">
      <EyeOff className="h-3 w-3" />
      Investor 唯讀
    </span>
  );
}

export function ReadOnlyNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
        <EyeOff className="h-4 w-4" />
      </span>
      <span>
        <strong className="font-semibold text-amber-100">Investor password login 投資者密碼登入</strong>
        <br />
        This terminal can only view, not trade. Log in with the main trading password, then orders will go through.
        <br />
        此終端只能查看，不能交易。請改用主交易密碼登入後再下單。
      </span>
    </div>
  );
}
