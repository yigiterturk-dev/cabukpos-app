"use client";

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
              className="w-full max-w-[34px] rounded-t-md bg-gradient-to-t from-brand to-[#5B82F5] transition-all"
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
  const pad = 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  // data boşken Math.min(...[]) = Infinity → path NaN üretir. Boşsa 0'a düş.
  const min = data.length ? Math.min(...data.map((d) => d.value)) : 0;
  const range = Math.max(1, max - min);
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (d.value - min) / range) * (height - pad * 2 - 16);
    return { x, y, ...d };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L ${points[points.length - 1]?.x.toFixed(1)} ${height - 16} L ${points[0]?.x.toFixed(1)} ${height - 16} Z`;

  const hasLabels = data.some((d) => d.label);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2F5BEA" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2F5BEA" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#lc-fill)" />
        <path d={path} fill="none" stroke="#2F5BEA" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#fff" stroke="#2F5BEA" strokeWidth="2">
            <title>{`${p.label}: ${format(p.value)}`}</title>
          </circle>
        ))}
      </svg>
      {/* X ekseni etiketleri — svg dışında (preserveAspectRatio="none" metni bozardı). Boş etiketler atlanır. */}
      {hasLabels && (
        <div className="mt-1.5 flex justify-between px-1 text-[10px] font-medium text-muted">
          {data.map((d, i) => (
            <span key={i} className="tnum">{d.label}</span>
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
