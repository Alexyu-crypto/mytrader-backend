import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Copy, HelpCircle, Info, Trash2, XCircle } from 'lucide-react';

type ConfirmTone = 'danger' | 'warning' | 'info';
type NoticeTone = 'error' | 'warning' | 'success' | 'info';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  tone?: ConfirmTone;
}

export interface NoticeOptions {
  title?: string;
  tone?: NoticeTone;
  copyValue?: string;
}

type Ask = (message: string, options?: ConfirmOptions) => Promise<boolean>;
export type Notify = (message: string, options?: NoticeOptions) => Promise<void>;

type Pending =
  | ({ kind: 'confirm'; message: string; resolve: (ok: boolean) => void } & ConfirmOptions)
  | ({ kind: 'notice'; message: string; resolve: (ok: boolean) => void } & NoticeOptions);

interface DialogApi {
  ask: Ask;
  notify: Notify;
}

const DialogContext = createContext<DialogApi | null>(null);

interface ToneStyle {
  icon: typeof AlertTriangle;
  badge: string;
  button: string;
  title: string;
  label: string;
}

const CONFIRM_TONES: Record<ConfirmTone, ToneStyle> = {
  danger: { icon: Trash2, badge: 'bg-red-500/10 text-red-400 ring-red-500/20', button: 'bg-red-500 hover:bg-red-400 focus-visible:ring-red-400 text-white', title: 'Are you sure? · 確定？', label: 'Delete · 刪除' },
  warning: { icon: AlertTriangle, badge: 'bg-amber-500/10 text-amber-400 ring-amber-500/20', button: 'bg-amber-500 hover:bg-amber-400 focus-visible:ring-amber-400 text-slate-950', title: 'Please confirm · 請確認', label: 'Continue · 繼續' },
  info: { icon: HelpCircle, badge: 'bg-cyan-500/10 text-cyan-400 ring-cyan-500/20', button: 'bg-cyan-500 hover:bg-cyan-400 focus-visible:ring-cyan-400 text-white', title: 'Please confirm · 請確認', label: 'Confirm · 確認' },
};

const NOTICE_TONES: Record<NoticeTone, ToneStyle> = {
  error: { icon: XCircle, badge: 'bg-red-500/10 text-red-400 ring-red-500/20', button: 'bg-slate-700 hover:bg-slate-600 focus-visible:ring-slate-400 text-white', title: 'Something went wrong · 出現問題', label: 'OK · 知道了' },
  warning: { icon: AlertTriangle, badge: 'bg-amber-500/10 text-amber-400 ring-amber-500/20', button: 'bg-slate-700 hover:bg-slate-600 focus-visible:ring-slate-400 text-white', title: 'Please note · 請注意', label: 'OK · 知道了' },
  success: { icon: CheckCircle2, badge: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20', button: 'bg-emerald-500 hover:bg-emerald-400 focus-visible:ring-emerald-400 text-white', title: 'Done · 完成', label: 'OK · 知道了' },
  info: { icon: Info, badge: 'bg-cyan-500/10 text-cyan-400 ring-cyan-500/20', button: 'bg-cyan-500 hover:bg-cyan-400 focus-visible:ring-cyan-400 text-white', title: 'Notice · 通知', label: 'OK · 知道了' },
};

function guessTone(message: string): ConfirmTone {
  return /^(delete|remove|withdraw)\b/i.test(message.trim()) ? 'danger' : 'warning';
}

function styleOf(p: Pending): ToneStyle {
  if (p.kind === 'confirm') return CONFIRM_TONES[p.tone ?? guessTone(p.message)];
  return NOTICE_TONES[p.tone ?? (p.copyValue ? 'info' : 'error')];
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const pending = queue[0] ?? null;

  const ask = useCallback<Ask>(
    (message, options) => new Promise<boolean>((resolve) => setQueue((q) => [...q, { kind: 'confirm', message, ...options, resolve }])),
    [],
  );

  const notify = useCallback<Notify>(
    (message, options) =>
      new Promise<void>((resolve) => setQueue((q) => [...q, { kind: 'notice', message, ...options, resolve: () => resolve() }])),
    [],
  );

  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setQueue((q) => q.slice(1));
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  const [api] = useState<DialogApi>(() => ({ ask, notify }));
  const style = pending ? styleOf(pending) : null;
  const Icon = style?.icon;
  const isConfirm = pending?.kind === 'confirm';
  const copyValue = pending?.kind === 'notice' ? pending.copyValue : undefined;

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && style && Icon && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => close(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in">
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${style.badge}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-tight text-white">{pending.title ?? style.title}</h2>
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-300">{pending.message}</p>
                {copyValue && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                    <Copy className="h-4 w-4 shrink-0 text-slate-500" />
                    <input
                      readOnly
                      value={copyValue}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-200 outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              {isConfirm && (
                <button
                  onClick={() => close(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  Cancel · 取消
                </button>
              )}
              <button
                ref={primaryRef}
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${style.button}`}
              >
                {pending.kind === 'confirm' ? pending.confirmLabel ?? style.label : style.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

function useDialogs(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('Dialog hooks must be used inside ConfirmProvider');
  return api;
}

export function useConfirm(): Ask {
  return useDialogs().ask;
}

export function useNotice(): Notify {
  return useDialogs().notify;
}
