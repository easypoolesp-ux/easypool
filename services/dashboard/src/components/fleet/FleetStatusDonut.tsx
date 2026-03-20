'use client'

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
    key: string
    label: string
    count: number
    color: string       // hex for SVG stroke
    tailwind: string    // tailwind dot class for the legend
}

interface Props {
    statuses: StatusCount[]
    criticalBuses?: { id: string; internal_id: string }[]
    onCriticalClick?: (busId: string) => void
}

export default function FleetStatusDonut({ statuses, criticalBuses = [], onCriticalClick }: Props) {
    const total = statuses.reduce((sum, s) => sum + s.count, 0)
    if (total === 0) return null

    // ── SVG Donut math ─────────────────────────────────────────────────────
    const RADIUS = 40
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS
    const STROKE = 10

    // Build arcs (skip zero-count segments)
    let accumulatedOffset = 0
    const arcs = statuses
        .filter(s => s.count > 0 && s.key !== 'no_signal') // no_signal shown separately
        .map(s => {
            const fraction = s.count / total
            const dashLength = fraction * CIRCUMFERENCE
            const gap = CIRCUMFERENCE - dashLength
            const offset = -accumulatedOffset // negative = clockwise rotation
            accumulatedOffset += dashLength
            return { ...s, dashLength, gap, offset }
        })

    const criticalCount = statuses.find(s => s.key === 'no_signal')?.count ?? 0

    return (
        <div className="flex items-center gap-4 px-1">
            {/* ── Donut ── */}
            <div className="relative shrink-0 w-[100px] h-[100px]">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    {/* Background ring */}
                    <circle
                        cx="50" cy="50" r={RADIUS}
                        fill="none"
                        stroke="currentColor"
                        className="text-slate-100 dark:text-slate-800"
                        strokeWidth={STROKE}
                    />
                    {/* Status arcs */}
                    {arcs.map(arc => (
                        <circle
                            key={arc.key}
                            cx="50" cy="50" r={RADIUS}
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
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">{total}</span>
                    <span className="text-[8px] uppercase tracking-widest text-slate-400 font-bold">Buses</span>
                </div>
            </div>

            {/* ── Right side: Legend + critical callout ── */}
            <div className="flex-1 min-w-0 space-y-2">
                {/* Legend row — only show statuses with count > 0 */}
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {statuses.filter(s => s.key !== 'no_signal' && s.count > 0).map(s => (
                        <div key={s.key} className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${s.tailwind}`} />
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{s.count}</span>
                            <span className="text-[9px] text-slate-400">{s.label}</span>
                        </div>
                    ))}
                </div>

                {/* No Signal — only visible when there is a critical failure */}
                {criticalCount > 0 && (
                    <div className="bg-red-50 dark:bg-red-900/15 border border-red-200/50 dark:border-red-800/30 rounded-xl px-3 py-2 space-y-1 mt-2">
                        <p className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            {criticalCount} No Signal
                        </p>
                        {criticalBuses.slice(0, 3).map(bus => (
                            <button
                                key={bus.id}
                                onClick={() => onCriticalClick?.(bus.id)}
                                className="block text-[10px] text-red-500 dark:text-red-400 font-bold hover:underline truncate"
                            >
                                → {bus.internal_id}
                            </button>
                        ))}
                        {criticalBuses.length > 3 && (
                            <p className="text-[9px] text-red-400 italic">+{criticalBuses.length - 3} more</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
