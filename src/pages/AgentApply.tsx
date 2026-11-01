import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, Clock, Handshake, Loader2, Palette, RefreshCw, Send, Upload, Users, XCircle } from 'lucide-react';
import { AgentApplicationForm } from '@/components/agents/AgentApplicationForm';
import { cancelApplication, fetchMyApplications, type AgentApplication } from '@/lib/agents';
import { useConfirm } from '@/hooks/useConfirm';

const PERKS = [
  { icon: Palette, title: 'Your own brand', zh: '自家品牌', text: 'Your name, colour and logo on your own client login page.' },
  { icon: Users, title: 'Your own clients', zh: '旗下客戶', text: 'Clients who sign up through your link are registered under you.' },
  { icon: Upload, title: 'Agent back office', zh: '代理商後台', text: 'Manage your branding, upload your logo and follow your clients.' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function AgentApply({ userId, onRoleChanged }: { userId: string; onRoleChanged: () => void }) {
  const ask = useConfirm();
  const [apps, setApps] = useState<AgentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchMyApplications(userId);
    setApps(res.apps);
    setError(res.error ?? '');
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = apps[0];
  const pending = latest?.status === 'pending' ? latest : null;
  const approved = latest?.status === 'approved' ? latest : null;

  const cancel = async () => {
    if (!pending || !(await ask('Withdraw this application? 確定撤回申請？', { tone: 'danger', confirmLabel: 'Withdraw · 撤回' }))) return;
    setBusy(true);
    const err = await cancelApplication(pending.id);
    setBusy(false);
    if (err) setError(err);
    else load();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <section className="relative overflow-hidden rounded-2xl border border-teal-500/20 bg-gradient-to-br from-teal-500/10 via-slate-800/40 to-slate-900 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-400/15 text-teal-300">
            <Handshake className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Become an Agent 成為代理商</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Grow with us. Approved agents get a branded client login link, their own back office and their own client list.
              <br />
              <span className="text-slate-400">與我們一起發展。獲批代理商可擁有品牌化客戶登入連結、專屬後台及旗下客戶名單。</span>
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {PERKS.map(({ icon: Icon, title, zh, text }) => (
            <div key={title} className="rounded-xl border border-white/5 bg-slate-900/60 p-4">
              <Icon className="h-5 w-5 text-teal-300" />
              <p className="mt-3 text-sm font-semibold text-white">
                {title} <span className="font-normal text-slate-500">{zh}</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
        </div>
      ) : approved ? (
        <StatusCard tone="emerald" icon={BadgeCheck} title="Approved! 申請已獲批" text="Your agent back office is ready. Refresh to open it. 您的代理商後台已開通，請重新整理進入。">
          <button onClick={onRoleChanged} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-emerald-400">
            <RefreshCw className="h-4 w-4" /> Open agent portal 進入代理商後台
          </button>
        </StatusCard>
      ) : pending ? (
        <StatusCard
          tone="amber"
          icon={Clock}
          title="Application under review 申請審核中"
          text={`Submitted ${formatDate(pending.created_at)} for "${pending.brand_name}" (link name: ${pending.desired_slug}). We will get back to you soon. 我們會盡快回覆。`}
        >
          <button onClick={cancel} disabled={busy} className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-red-500/50 hover:text-red-300 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Withdraw 撤回申請
          </button>
        </StatusCard>
      ) : showForm ? (
        <AgentApplicationForm
          onCancel={() => setShowForm(false)}
          onSubmitted={() => {
            setShowForm(false);
            load();
          }}
        />
      ) : (
        <div className="space-y-4">
          {latest?.status === 'rejected' && (
            <StatusCard tone="red" icon={XCircle} title="Previous application not approved 上次申請未獲批" text={latest.admin_note || 'You are welcome to apply again with updated details. 歡迎更新資料後再次申請。'} />
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-teal-400 px-5 py-3 text-sm font-semibold text-black shadow-lg shadow-teal-500/20 transition-all hover:-translate-y-0.5 hover:bg-teal-300"
          >
            <Send className="h-4 w-4" /> Start application 開始申請
          </button>
        </div>
      )}

      {apps.length > 1 && (
        <section className="rounded-xl border border-slate-700 bg-slate-800/40">
          <h2 className="border-b border-slate-700 px-5 py-3 text-sm font-semibold text-white">Past applications 過往申請</h2>
          <ul className="divide-y divide-slate-700/60">
            {apps.slice(1).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="truncate text-slate-300">{a.brand_name}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {a.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5" />}
                  {a.status} · {formatDate(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const TONES = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
};

function StatusCard({ tone, icon: Icon, title, text, children }: { tone: keyof typeof TONES; icon: typeof Clock; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center ${TONES[tone]}`}>
      <Icon className="h-6 w-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{text}</p>
      </div>
      {children}
    </div>
  );
}
