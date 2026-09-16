"use client";

import { useState } from "react";

// Hafif SVG grafikler — harici kütüphane yok, marka rengiyle.

export function BarChart({
  data,
  height = 180,
  format = (n: number) => String(n),
}: {
  data: { label: string; value: number; sub?: string }[];
  height?: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 36);
        return (
          <div key={i} className="group flex flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[10.5px] font-semibold tnum text-ink opacity-0 transition-opacity group-hover:opacity-100">
              {format(d.value)}
            </span>
            <div
              className="w-full max-w-[34px] rounded-t-md bg-gradient-to-t from-brand-deep to-brand transition-all group-hover:from-brand group-hover:to-mint"
              style={{ height: Math.max(3, h) }}
              title={`${d.label}: ${format(d.value)}`}
            />
            <span className="text-[10px] font-medium text-muted">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Monotone kübik interpolasyon (Fritsch–Carlson) — veriyi AŞIRI abartmadan yumuşatır.
 * Düz poliline'ın testere dişi görünümünü önler; noktalar arasına sahte tepe/dip eklemez.
 */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return pts.length ? `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}` : "";
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dy[i] / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
    }
  }
  t.push(m[n - 2]);
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const cx1 = pts[i].x + dx[i] / 3;
    const cy1 = pts[i].y + t[i] * (dx[i] / 3);
    const cx2 = pts[i + 1].x - dx[i] / 3;
    const cy2 = pts[i + 1].y - t[i + 1] * (dx[i] / 3);
    d += ` C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

/** Eksen etiketi için kompakt para biçimi: ₺18.450 → ₺18,4B · ₺2.300.000 → ₺2,3M */
function compactTRY(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${sign}₺${Math.round(abs / 1_000) || (abs / 1000).toFixed(1).replace(".", ",")}B`;
  return `${sign}₺${Math.round(abs)}`;
}

export function LineChart({
  data,
  height = 200,
  format = (n: number) => String(n),
}: {
  data: { label: string; value: number }[];
  height?: number;
  format?: (n: number) => string;
}) {
  const w = 600;
  const padX = 10;
  const padTop = 14;
  const axisH = 20; // x etiketleri svg dışında (HTML) — grafiğin çizim yüksekliği:
  const plotH = Math.max(80, height - axisH);
  const max = Math.max(1, ...data.map((d) => d.value));
  // Ciro 0'dan başlar — min'e göre ölçek gürültüyü abartıp dalgalanmayı şişirir.
  const yMax = max * 1.08;
  const stepX = (w - padX * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    // savunmacı: beklenmedik negatif/taşan değer grafikten taşmasın
    y: Math.min(plotH - 6, Math.max(padTop, padTop + (1 - d.value / yMax) * (plotH - padTop - 6))),
    ...d,
  }));

  // 7 günlük yürüyen ortalama — gürültü içinde trendi okumayı sağlar
  const avg = data.length >= 5
    ? points.map((_, i) => {
        const from = Math.max(0, i - 6);
        const slice = data.slice(from, i + 1);
        const mean = slice.reduce((s, x) => s + x.value, 0) / slice.length;
        return { x: points[i].x, y: padTop + (1 - mean / yMax) * (plotH - padTop - 6) };
      })
    : null;

  const path = monotonePath(points);
  const area =
    points.length > 1
      ? `${path} L ${points[points.length - 1].x.toFixed(1)} ${plotH - 2} L ${points[0].x.toFixed(1)} ${plotH - 2} Z`
      : "";
  const avgPath = avg ? monotonePath(avg) : "";

  // Tepe noktası — en yüksek güne tek değer etiketi
  const peakIdx = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const hasPeak = points.length > 2 && points[peakIdx].value > 0;

  // X etiketleri — en fazla ~7 etiket (yoksa üst üste biner)
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  const xTicks = points.filter((_, i) => i % labelEvery === 0 || i === points.length - 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: padTop + (1 - f) * (plotH - padTop - 6),
    v: yMax * f,
  }));

  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[13px] text-muted" style={{ height }}>
        Bu dönemde veri yok.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex">
        {/* Y ekseni etiketleri */}
      <div className="relative w-12 shrink-0" style={{ height: plotH }}>
        {yTicks.map((t, i) => (
          <span
            key={i}
            className="tnum absolute right-1.5 -translate-y-1/2 text-[9.5px] font-medium text-muted"
            style={{ top: t.y }}
          >
            {compactTRY(t.v)}
          </span>
        ))}
      </div>

      <div className="relative min-w-0 flex-1">
        <svg
          viewBox={`0 0 ${w} ${plotH}`}
          className="block w-full"
          style={{ height: plotH }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B7A5A" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#1B7A5A" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* yatay grid çizgileri */}
          {yTicks.map((t, i) => (
            <line
              key={i}
              x1={padX}
              x2={w - padX}
              y1={t.y}
              y2={t.y}
              stroke="#E3E8E5"
              strokeWidth="1"
              strokeDasharray={i === 0 ? undefined : "3 4"}
            />
          ))}

          {area && <path d={area} fill="url(#lc-fill)" />}
          {avgPath && (
            <path
              d={avgPath}
              fill="none"
              stroke="#E8A33D"
              strokeWidth="1.6"
              strokeDasharray="5 4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={path}
            fill="none"
            stroke="#1B7A5A"
            strokeWidth="2.2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Noktalar — HTML katmanında (yuvarlak kalmaları için); hover tooltip */}
        <div className="absolute inset-0" style={{ height: plotH }}>
          {points.map((p, i) => (
            <button
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${p.label}: ${format(p.value)}`}
              className="absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ left: `${(p.x / w) * 100}%`, top: `${(p.y / plotH) * 100}%` }}
            >
              <span
                className={`block rounded-full transition-all ${
                  hover === i ? "h-3 w-3 bg-brand" : "h-1.5 w-1.5 bg-brand/70"
                }`}
              />
              {hover === i && (
                <span className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[11.5px] font-semibold text-white shadow-pop">
                  {p.label} · {format(p.value)}
                </span>
              )}
            </button>
          ))}

          {/* Tepe etiketi */}
          {hasPeak && hover === null && (
            <span
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand-deep"
              style={{
                left: `${(points[peakIdx].x / w) * 100}%`,
                top: `${Math.max(0.5, (points[peakIdx].y / plotH) * 100 - 9)}%`,
              }}
            >
              {compactTRY(points[peakIdx].value)}
            </span>
          )}
        </div>
      </div>

      </div>

      {/* X ekseni — svg dışında (preserveAspectRatio="none" metni bozardı) */}
      {xTicks.length > 1 && (
        <div className="relative ml-12 h-4">
          {xTicks.map((t, i) => (
            <span
              key={i}
              className="tnum absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-muted"
              style={{ left: `${(t.x / w) * 100}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Donut({
  segments,
  size = 140,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
      </g>
    </svg>
  );
}
