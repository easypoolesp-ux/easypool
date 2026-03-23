"use client";

import { BusTimeline } from "@/hooks/useTimelineData";
import { totalKmFromSeries } from "@/lib/geoUtils";
import { PALETTE } from "./KmChart";

interface Props { data: BusTimeline[] }

export default function SummaryStats({ data }: Props) {
  if (data.length === 0) return null;

  const sorted = [...data].sort(
    (a, b) => totalKmFromSeries(b.series) - totalKmFromSeries(a.series)
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {sorted.map((bus, idx) => (
        <div
          key={bus.bus_id}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/40"
        >
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: PALETTE[idx % PALETTE.length] }}
          />
          <div className="min-w-0">
            <p className="text-xs text-slate-400 truncate">{bus.internal_id}</p>
            <p className="text-sm font-bold text-slate-100">
              {totalKmFromSeries(bus.series).toFixed(1)} km
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
