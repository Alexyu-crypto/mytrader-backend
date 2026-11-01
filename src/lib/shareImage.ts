export interface SignalImageData {
  name: string;
  subtitle: string;
  growthPct: number;
  stats: [string, string][];
  curve: number[];
  footer: string;
}

const W = 1200;
const H = 630;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function renderSignalImage(data: SignalImageData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas not supported'));
  const font = (weight: number, size: number) => `${weight} ${size}px Inter, "Segoe UI", "Noto Sans TC", system-ui, sans-serif`;
  const up = data.growthPct >= 0;
  const accent = up ? '#34d399' : '#f87171';

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#082f3a');
  bg.addColorStop(0.5, '#0f172a');
  bg.addColorStop(1, '#020617');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W - 120, 60, 0, W - 120, 60, 420);
  glow.addColorStop(0, 'rgba(34,211,238,0.22)');
  glow.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#22d3ee';
  roundRect(ctx, 64, 56, 40, 40, 10);
  ctx.fill();
  ctx.fillStyle = '#020617';
  ctx.font = font(700, 22);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('M', 84, 77);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(600, 24);
  ctx.fillText('MyTrader Tools', 118, 70);
  ctx.fillStyle = '#94a3b8';
  ctx.font = font(400, 16);
  ctx.fillText('Trading Signals 交易信號', 118, 94);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(700, 52);
  ctx.fillText(data.name.length > 30 ? `${data.name.slice(0, 29)}…` : data.name, 64, 196);
  ctx.fillStyle = '#94a3b8';
  ctx.font = font(400, 22);
  ctx.fillText(data.subtitle, 64, 234);

  ctx.fillStyle = '#64748b';
  ctx.font = font(600, 18);
  ctx.fillText('GROWTH 增長', 64, 300);
  ctx.fillStyle = accent;
  ctx.font = font(700, 96);
  ctx.fillText(`${up ? '+' : ''}${data.growthPct.toFixed(2)}%`, 60, 392);

  const cx = 620;
  const cy = 150;
  const cw = 516;
  const ch = 250;
  const values = data.curve.length > 1 ? data.curve : [0, 0];
  const min = Math.min(0, ...values);
  const span = Math.max(0, ...values) - min || 1;
  const pts = values.map((v, i) => [cx + (i / (values.length - 1)) * cw, cy + ch - ((v - min) / span) * ch] as const);
  const area = ctx.createLinearGradient(0, cy, 0, cy + ch);
  area.addColorStop(0, up ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)');
  area.addColorStop(1, 'rgba(15,23,42,0)');
  ctx.beginPath();
  ctx.moveTo(cx, cy + ch);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(cx + cw, cy + ch);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const boxW = (W - 128 - 24 * (data.stats.length - 1)) / data.stats.length;
  data.stats.forEach(([label, value], i) => {
    const x = 64 + i * (boxW + 24);
    ctx.fillStyle = 'rgba(30,41,59,0.7)';
    roundRect(ctx, x, 440, boxW, 96, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(71,85,105,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = font(500, 17);
    ctx.fillText(label, x + 22, 476);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 32);
    ctx.fillText(value, x + 22, 516);
  });

  ctx.fillStyle = '#64748b';
  ctx.font = font(400, 16);
  ctx.fillText(data.footer, 64, 590);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#22d3ee';
  ctx.font = font(600, 18);
  ctx.fillText('Copy this signal 立即跟單 →', W - 64, 590);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image failed'))), 'image/png'));
}
