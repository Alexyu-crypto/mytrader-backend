import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatTime } from '@/lib/format';

type LoginEvent = { id: string; email: string; ip: string; user_agent: string; result: 'ok' | 'ip_blocked'; created_at: string };

function device(ua: string) {
  if (!ua) return '-';
  const os = /iphone|ipad/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'Other';
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome\//i.test(ua) ? 'Chrome' : /firefox\//i.test(ua) ? 'Firefox' : /safari\//i.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}

export function LoginLogCard() {
  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error: err } = await supabase
      .from('login_events')
      .select('id, email, ip, user_agent, result, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) {
      console.error('login log load failed', err);
      setError('Could not load the sign-in log. · 未能載入登入記錄。');
      setEvents([]);
    } else setEvents((data ?? []) as LoginEvent[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const shown = (events ?? []).filter((e) => !q || e.email.toLowerCase().includes(q) || e.ip.includes(q));

  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-lg border bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
          <History className="w-4 h-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-white font-semibold">Sign-in IP Log · 登入 IP 記錄</h2>
          <p className="text-slate-400 text-sm mt-0.5">Every website sign-in with its IP address and device, latest 200 shown. · 每次網站登入的 IP 及裝置（顯示最近 200 筆）。</p>
        </div>
        <button type="button" onClick={load} aria-label="Refresh · 重新整理" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email or IP · 搜尋電郵或 IP"
          className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
        />
      </div>

      {events === null ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading... · 載入中...</div>
      ) : shown.length === 0 ? (
        <p className="text-slate-500 text-sm">No sign-ins recorded yet. · 未有登入記錄。</p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 text-slate-400 text-xs">
              <tr>
                <th className="text-left font-medium px-3 py-2">Time · 時間</th>
                <th className="text-left font-medium px-3 py-2">User · 用戶</th>
                <th className="text-left font-medium px-3 py-2">IP</th>
                <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Device · 裝置</th>
                <th className="text-left font-medium px-3 py-2">Result · 結果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {shown.map((e) => (
                <tr key={e.id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatTime(e.created_at)}</td>
                  <td className="px-3 py-2 text-white truncate max-w-[12rem]">{e.email || '-'}</td>
                  <td className="px-3 py-2 font-mono text-slate-200">{e.ip || '-'}</td>
                  <td className="px-3 py-2 text-slate-400 hidden sm:table-cell">{device(e.user_agent)}</td>
                  <td className="px-3 py-2">
                    {e.result === 'ok' ? (
                      <span className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">OK · 成功</span>
                    ) : (
                      <span className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">Blocked · 已阻擋</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <div className="text-red-400 text-sm">{error}</div>}
    </section>
  );
}
