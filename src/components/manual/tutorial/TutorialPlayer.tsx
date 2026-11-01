import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Captions, Maximize, Minimize, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { CHAPTERS, SCENES, lineDuration } from '@/components/manual/tutorial/tutorialScript';

type SubMode = 'both' | 'zh' | 'en' | 'off';

const SUB_LABEL: Record<SubMode, string> = { both: '中 / EN', zh: '中文', en: 'EN', off: 'Off 關' };
const SUB_ORDER: SubMode[] = ['both', 'zh', 'en', 'off'];
const SPEEDS = [0.75, 1, 1.25, 1.5];

const TIMELINE = (() => {
  let t = 0;
  const lines: { scene: number; line: number; start: number; end: number }[] = [];
  const scenes: { start: number; end: number }[] = [];
  SCENES.forEach((scene, si) => {
    const start = t;
    scene.lines.forEach((line, li) => {
      const d = lineDuration(line);
      lines.push({ scene: si, line: li, start: t, end: t + d });
      t += d;
    });
    scenes.push({ start, end: t });
  });
  const chapters = CHAPTERS.map((_, ci) => scenes[SCENES.findIndex((s) => s.chapter === ci)].start);
  return { lines, scenes, chapters, total: t };
})();

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function FitToStage({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const update = () => {
      const s = Math.min(o.clientWidth / i.scrollWidth, o.clientHeight / i.scrollHeight, 1.5);
      setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div ref={inner} style={{ transform: `scale(${scale})` }} className="w-[640px] shrink-0 origin-center [&_figcaption]:hidden">
        {children}
      </div>
    </div>
  );
}

const SceneVisual = memo(function SceneVisual({ index }: { index: number }) {
  const scene = SCENES[index];
  const Visual = scene.visual;
  if (Visual) {
    return (
      <div className="absolute inset-x-4 top-12 bottom-20 sm:inset-x-10 sm:top-16 sm:bottom-28 animate-ken-burns">
        <FitToStage>
          <Visual />
        </FitToStage>
      </div>
    );
  }
  const chapter = CHAPTERS[scene.chapter];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-16 text-center sm:pb-24 animate-fade-up">
      <Logo className="mb-3 h-10 w-10 sm:mb-5 sm:h-14 sm:w-14" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400 sm:text-xs">{chapter.en}</p>
      <h3 className="mt-2 text-xl font-bold leading-tight text-white sm:text-4xl">{scene.title.zh}</h3>
      <p className="mt-1 text-sm text-slate-400 sm:text-lg">{scene.title.en}</p>
    </div>
  );
});

export function TutorialPlayer() {
  const shell = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [subs, setSubs] = useState<SubMode>('both');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      setT((prev) => Math.min(TIMELINE.total, prev + dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const ended = t >= TIMELINE.total;
  useEffect(() => {
    if (ended) setPlaying(false);
  }, [ended]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const lineIdx = Math.max(0, TIMELINE.lines.findIndex((l) => t < l.end));
  const current = ended ? TIMELINE.lines[TIMELINE.lines.length - 1] : TIMELINE.lines[lineIdx];
  const scene = SCENES[current.scene];
  const caption = scene.lines[current.line];
  const chapterIdx = scene.chapter;

  const seek = useCallback((ms: number) => {
    setT(Math.max(0, Math.min(TIMELINE.total - 1, ms)));
    setStarted(true);
  }, []);

  const toggle = useCallback(() => {
    setStarted(true);
    if (ended) {
      setT(0);
      setPlaying(true);
    } else setPlaying((p) => !p);
  }, [ended]);

  const stepScene = (dir: 1 | -1) => {
    const idx = current.scene;
    const target = dir === 1 ? Math.min(SCENES.length - 1, idx + 1) : t - TIMELINE.scenes[idx].start > 1500 ? idx : Math.max(0, idx - 1);
    seek(TIMELINE.scenes[target].start);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else shell.current?.requestFullscreen?.();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowRight') seek(t + 5000);
    else if (e.key === 'ArrowLeft') seek(t - 5000);
    else if (e.key === 'f') toggleFullscreen();
  };

  const onBar = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - rect.left) / rect.width) * TIMELINE.total);
  };

  const visual = useMemo(() => <SceneVisual key={current.scene} index={current.scene} />, [current.scene]);
  const progress = (t / TIMELINE.total) * 100;

  return (
    <section aria-label="Tutorial video 教學影片" className="space-y-3">
      <div
        ref={shell}
        tabIndex={0}
        data-paused={playing ? undefined : ''}
        onKeyDown={onKey}
        className={`group relative overflow-hidden bg-slate-950 outline-none ring-cyan-500/40 focus-visible:ring-2 ${
          fullscreen ? 'flex h-full w-full items-center' : 'rounded-2xl border border-slate-700 shadow-2xl shadow-black/40'
        }`}
      >
        <div className={`relative w-full ${fullscreen ? 'h-full' : 'aspect-video'}`}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.12),transparent_60%)]" />
          <div className="absolute inset-0 cursor-pointer" onClick={toggle} />

          {started && (
            <>
              <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 sm:left-5 sm:top-4">
                <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 ring-1 ring-cyan-500/30 sm:text-xs">
                  {chapterIdx}/{CHAPTERS.length - 1}
                </span>
                <span className="truncate text-xs font-medium text-slate-200 sm:text-sm">{scene.title.zh} · <span className="text-slate-400">{scene.title.en}</span></span>
              </div>
              <div className="pointer-events-none">{visual}</div>
            </>
          )}

          {started && subs !== 'off' && (
            <div className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3 transition-all duration-300 ${
              playing ? 'bottom-3 group-hover:bottom-16 sm:bottom-6 sm:group-hover:bottom-20' : 'bottom-16 sm:bottom-20'
            }`}>
              <div key={`${current.scene}-${current.line}`} className="max-w-[92%] rounded-lg bg-black/80 px-3 py-1.5 text-center shadow-lg animate-fade-in sm:px-5 sm:py-2.5">
                {subs !== 'en' && <p className="text-xs font-medium leading-snug text-white sm:text-lg">{caption.zh}</p>}
                {subs !== 'zh' && <p className={`leading-snug text-[11px] sm:text-sm ${subs === 'en' ? 'text-white sm:text-lg' : 'mt-0.5 text-slate-300'}`}>{caption.en}</p>}
              </div>
            </div>
          )}

          {(!started || ended) && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/70 text-center backdrop-blur-[2px]">
              <button
                onClick={toggle}
                aria-label={ended ? 'Replay' : 'Play'}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500 text-slate-950 shadow-xl shadow-cyan-500/30 transition-transform hover:scale-105 sm:h-20 sm:w-20"
              >
                {ended ? <RotateCcw className="h-7 w-7" /> : <Play className="ml-1 h-8 w-8 fill-current" />}
              </button>
              <p className="mt-4 text-base font-semibold text-white sm:text-xl">{ended ? '重新播放 · Replay' : '教學影片 · Video tutorial'}</p>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">中英文字幕 · Chinese & English subtitles · {clock(TIMELINE.total)}</p>
            </div>
          )}
        </div>

        <div className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-2 pt-8 transition-opacity duration-300 sm:px-4 ${
          started && playing ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-100'
        } ${started ? '' : 'hidden'}`}>
          <div className="group/bar relative h-4 cursor-pointer" onPointerDown={onBar} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(TIMELINE.total / 1000)} aria-valuenow={Math.round(t / 1000)}>
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20 transition-all group-hover/bar:h-1.5">
              <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress}%` }} />
            </div>
            {TIMELINE.chapters.slice(1).map((start) => (
              <span key={start} className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-slate-950" style={{ left: `${(start / TIMELINE.total) * 100}%` }} />
            ))}
            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow" style={{ left: `${progress}%` }} />
          </div>
          <div className="mt-1 flex items-center gap-1 text-white sm:gap-2">
            <button onClick={() => stepScene(-1)} aria-label="Previous" className="rounded-md p-1.5 text-slate-200 transition-colors hover:bg-white/10"><SkipBack className="h-4 w-4" /></button>
            <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="rounded-md p-1.5 transition-colors hover:bg-white/10">
              {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
            </button>
            <button onClick={() => stepScene(1)} aria-label="Next" className="rounded-md p-1.5 text-slate-200 transition-colors hover:bg-white/10"><SkipForward className="h-4 w-4" /></button>
            <span className="ml-1 text-xs tabular-nums text-slate-300">{clock(t)} / {clock(TIMELINE.total)}</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
                className="rounded-md px-2 py-1 text-xs font-semibold tabular-nums text-slate-200 transition-colors hover:bg-white/10"
                aria-label="Playback speed"
              >
                {speed}x
              </button>
              <button
                onClick={() => setSubs(SUB_ORDER[(SUB_ORDER.indexOf(subs) + 1) % SUB_ORDER.length])}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-white/10 ${subs === 'off' ? 'text-slate-400' : 'text-cyan-300'}`}
                aria-label="Subtitles"
              >
                <Captions className="h-4 w-4" /> <span className="hidden sm:inline">{SUB_LABEL[subs]}</span>
              </button>
              <button onClick={toggleFullscreen} aria-label="Fullscreen" className="rounded-md p-1.5 text-slate-200 transition-colors hover:bg-white/10">
                {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CHAPTERS.map((ch, i) => (
          <button
            key={ch.en}
            onClick={() => {
              seek(TIMELINE.chapters[i]);
              setPlaying(true);
            }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
              started && i === chapterIdx
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-white'
            }`}
          >
            <span className="tabular-nums text-slate-500">{clock(TIMELINE.chapters[i])}</span>
            {ch.zh}
          </button>
        ))}
      </div>
    </section>
  );
}
