import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, UserPlus, X } from 'lucide-react';
import type { Role } from '@/hooks/useAuth';
import { RolePicker, ROLE_DESC } from '@/components/users/RolePicker';
import { callAdminUsers } from '@/lib/members';

export function AddUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<Role>('client');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = await callAdminUsers({ action: 'create', email, password, role });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onCreated();
    onClose();
  };

  const input =
    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => !busy && onClose()} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
          <UserPlus className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">Add user 新增用戶</h2>
        <p className="mt-1 text-sm text-slate-400">The account is approved straight away. Share the email and password with the person. 帳戶會即時生效。</p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Email 電郵</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={input} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Starting password 初始密碼 (min 6)</span>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className={`${input} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Permission 權限</span>
            <RolePicker value={role} onChange={setRole} lockedRoles={['agent']} />
            <p className="mt-2 text-xs text-slate-500">{ROLE_DESC[role]}</p>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Cancel 取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-cyan-400 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Add user 新增
          </button>
        </div>
      </form>
    </div>
  );
}
