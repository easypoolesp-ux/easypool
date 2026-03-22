"use client";

/**
 * FleetStatusDonut — SVG donut chart showing fleet health at a glance.
 *
 * Design decisions:
 *  - Pure SVG, zero dependencies (no chart library needed)
 *  - Red/critical buses are pulled OUT of the donut and shown as a
 *    prominent callout, so even 1 out of 1000 is impossible to miss.
 *  - Total fleet count sits in the donut center.
 *  - Compact: designed to fit above the bus list in the sidebar.
 */

interface StatusCount {
  key: string;
  label: string;
  count: number;
  color: string; // hex for SVG stroke
  tailwind: string; // tailwind dot class for the legend
}

interface Props {
  statuses: StatusCount[];
}

export default function FleetStatusDonut({ statuses }: Props) {
  const total = statuses.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  // ── SVG Donut math ─────────────────────────────────────────────────────
  const RADIUS = 40;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const STROKE = 10;

  // Build arcs (skip zero-count segments)
  let accumulatedOffset = 0;
  const arcs = statuses
    .filter((s) => s.count > 0 && s.key !== "no_signal") // no_signal shown separately
    .map((s) => {
      const fraction = s.count / total;
      const dashLength = fraction * CIRCUMFERENCE;
      const gap = CIRCUMFERENCE - dashLength;
      accumulatedOffset += dashLength;
      return {
        key: s.key,
        color: s.color,
        dashLength,
        gap,
        offset: -(accumulatedOffset - dashLength),
      };
    });

  return (
    <div className="flex items-center gap-4 px-1">
      {/* ── Donut ── */}
      <div className="relative shrink-0 w-[100px] h-[100px]">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            className="text-slate-100 dark:text-slate-800"
            strokeWidth={STROKE}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE}
              strokeDasharray={`${arc.dashLength} ${arc.gap}`}
              strokeDashoffset={arc.offset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">
            {total}
          </span>
          <span className="text-[8px] uppercase tracking-widest text-slate-400 font-bold">
            Buses
          </span>
        </div>
      </div>

      {/* ── Right side: Legend ── */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {statuses
            .filter((s) => s.key !== "no_signal")
            .map((s) => (
              <div
                key={s.key}
                className={`flex items-center gap-1.5 ${s.count === 0 ? "opacity-30" : ""}`}
              >
                <div className={`w-2 h-2 rounded-full ${s.tailwind}`} />
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                  {s.count}
                </span>
                <span className="text-[9px] text-slate-400 capitalize">
                  {s.label}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
