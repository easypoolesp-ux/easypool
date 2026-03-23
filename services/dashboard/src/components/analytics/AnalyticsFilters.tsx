"use client";

import { Calendar, Filter } from "lucide-react";
import { PALETTE } from "./KmChart";

interface BusOption { id: string; internal_id: string }

interface Props {
  startDate: string;
  endDate: string;
  today: string;
  selectedBuses: Set<string>;
  busOptions: BusOption[];
  filterOpen: boolean;
  onStartChange: (d: string) => void;
  onEndChange: (d: string) => void;
  onToggleFilter: () => void;
  onToggleBus: (id: string) => void;
  onClearBuses: () => void;
}

export default function AnalyticsFilters({
  startDate, endDate, today, selectedBuses, busOptions,
  filterOpen, onStartChange, onEndChange, onToggleFilter, onToggleBus, onClearBuses,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range */}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input type="date" value={startDate} max={today}
            onChange={(e) => onStartChange(e.target.value)}
            className="bg-transparent text-slate-200 text-xs outline-none w-32" />
          <span className="text-slate-500">→</span>
          <input type="date" value={endDate} max={today} min={startDate}
            onChange={(e) => onEndChange(e.target.value)}
            className="bg-transparent text-slate-200 text-xs outline-none w-32" />
        </div>

        {/* Bus filter toggle */}
        <button onClick={onToggleFilter}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
            selectedBuses.size > 0
              ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
              : "bg-slate-800/60 border-slate-700/50 text-slate-300 hover:border-slate-600"
          }`}>
          <Filter className="w-4 h-4" />
          {selectedBuses.size > 0 ? `${selectedBuses.size} buses` : "All buses"}
        </button>
      </div>

      {/* Bus picker */}
      {filterOpen && (
        <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
          <button onClick={onClearBuses}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              selectedBuses.size === 0
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-slate-700/50 border-slate-600/50 text-slate-300 hover:border-slate-500"
            }`}>All</button>
          {busOptions.map((bus, i) => {
            const active = selectedBuses.has(bus.id);
            const color = PALETTE[i % PALETTE.length];
            return (
              <button key={bus.id} onClick={() => onToggleBus(bus.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                style={active
                  ? { background: color + "33", borderColor: color + "88", color }
                  : { background: "", borderColor: "", color: "#94a3b8", border: "1px solid rgba(100,116,139,0.4)" }
                }>
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: color }} />
                {bus.internal_id}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
