import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Facebook, ImageDown, Info, Linkedin, Loader2, Mail, MessageCircle, Send, Share2, Twitter, X } from 'lucide-react';
import { channelUrl, withUtm, type Channel, type ShareContent } from '@/lib/share';
import { Hint, IconButton } from '@/components/IconButton';
import { useNotice } from '@/hooks/useConfirm';

const CHANNELS: { key: Channel; label: string; icon: typeof Send; tone: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, tone: 'bg-[#25D366]/15 text-[#4ade80] ring-[#25D366]/30' },
  { key: 'telegram', label: 'Telegram', icon: Send, tone: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, tone: 'bg-blue-500/15 text-blue-300 ring-blue-500/30' },
  { key: 'x', label: 'X / Twitter', icon: Twitter, tone: 'bg-slate-500/15 text-slate-200 ring-slate-500/30' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, tone: 'bg-sky-600/15 text-sky-300 ring-sky-600/30' },
  { key: 'line', label: 'LINE', icon: MessageCircle, tone: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  { key: 'email', label: 'Email 電郵', icon: Mail, tone: 'bg-amber-400/15 text-amber-300 ring-amber-400/30' },
];

export interface ShareProps {
  content: ShareContent;
  heading?: string;
  note?: string;
  image?: { filename: string; render: () => Promise<Blob> };
}

function ShareDialog({ content, heading = 'Share 分享', note, image, onClose }: ShareProps & { onClose: () => void }) {
  const [copied, setCopied] = useState<'link' | 'text' | null>(null);
  const notify = useNotice();
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState('');
  const link = withUtm(content.url, 'copy_link', content.campaign);
  const canNative = typeof navigator.share === 'function';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const copy = async (kind: 'link' | 'text') => {
    const value = kind === 'link' ? link : `${content.text}\n${link}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      void notify('Your browser blocked copying. Please copy it manually below. 瀏覽器不允許自動複製，請手動複製。', { title: 'Copy manually · 手動複製', copyValue: value });
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: content.title, text: content.text, url: withUtm(content.url, 'native', content.campaign) });
    } catch {
      /* dismissed */
    }
  };

  const saveImage = async () => {
    if (!image) return;
    setImageBusy(true);
    setError('');
    try {
      const blob = await image.render();
      const file = new File([blob], image.filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: content.title, text: `${content.text}\n${link}` }).catch(() => undefined);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = image.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setError('Could not create the image. 未能產生圖片。');
    }
    setImageBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl border border-slate-700 bg-slate-900 p-6 text-left shadow-2xl animate-pop-in sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium text-cyan-300"><Share2 className="h-3.5 w-3.5" /> {heading}</p>
            <p className="mt-1 truncate font-semibold text-white">{content.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm leading-relaxed text-slate-300">{content.text}</p>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {CHANNELS.map(({ key, label, icon: Icon, tone }) => (
            <a
              key={key}
              href={channelUrl(key, content)}
              target={key === 'email' ? undefined : '_blank'}
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition-colors hover:bg-slate-800/70"
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-full ring-1 transition-transform group-hover:scale-110 ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] leading-tight text-slate-400 group-hover:text-white">{label}</span>
            </a>
          ))}
          {canNative && (
            <button onClick={nativeShare} className="group flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-slate-800/70">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30 transition-transform group-hover:scale-110">
                <Share2 className="h-5 w-5" />
              </span>
              <span className="text-[11px] leading-tight text-slate-400 group-hover:text-white">More 更多</span>
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 p-1.5 pl-3">
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{link}</span>
          <IconButton label={copied === 'link' ? 'Copied · 已複製' : 'Copy link · 複製連結'} onClick={() => copy('link')}>
            {copied === 'link' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </IconButton>
        </div>

        <div className={`mt-2 grid gap-2 ${image ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            onClick={() => copy('text')}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            {copied === 'text' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            Copy post text 複製帖文
          </button>
          {image && (
            <button
              onClick={saveImage}
              disabled={imageBusy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-cyan-400 disabled:opacity-60"
            >
              {imageBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageDown className="h-3.5 w-3.5" />}
              Share image 分享圖片
            </button>
          )}
        </div>
        {image && <p className="mt-2 text-[11px] text-slate-500">Image is ideal for Instagram, WeChat and stories. 圖片適合 IG、微信及限時動態。</p>}

        {note && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] leading-relaxed text-amber-200/90">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {note}
          </p>
        )}
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  );
}

export function ShareButton({ variant = 'button', label = 'Share 分享', className = '', ...props }: ShareProps & { variant?: 'button' | 'icon'; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'icon' ? (
        <Hint label={label}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            aria-label={label}
            className={`inline-flex items-center justify-center rounded-lg border border-slate-700 p-2 text-slate-400 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300 active:scale-95 ${className}`}
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </Hint>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white ${className}`}
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      )}
      {open && createPortal(<ShareDialog {...props} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
