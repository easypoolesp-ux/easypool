"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { TrendingUp, RefreshCw } from "lucide-react";
import { useTimelineData } from "@/hooks/useTimelineData";
import AnalyticsFilters from "@/components/analytics/AnalyticsFilters";
import SummaryStats from "@/components/analytics/SummaryStats";

// KmChart uses browser-only APIs (ResizeObserver + canvas) — load client-side only
const KmChart = dynamic(() => import("@/components/analytics/KmChart"), { ssr: false });

import { apiRequest } from "@/lib/apiClient";

interface BusOption { id: string; internal_id: string }

export default function AnalyticsPage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedBuses, setSelectedBuses] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [busOptions, setBusOptions] = useState<BusOption[]>([]);

  // Load available buses once
  useEffect(() => {
    apiRequest("/api/buses", "get")
      .then((d) => setBusOptions(Array.isArray(d) ? d : d.results ?? []))
      .catch((err) => console.error("Filter bus load error:", err));
  }, []);

  const busIds = Array.from(selectedBuses);
  const { data = [], isLoading: isFetching } = useTimelineData(busIds, startDate, endDate);

  const toggleBus = useCallback((id: string) => {
    setSelectedBuses((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full gap-4 p-4 md:p-6 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Fleet Analytics</h1>
            <p className="text-xs text-slate-400">View and analyze your fleet performance</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <AnalyticsFilters
        startDate={startDate} endDate={endDate} today={today}
        selectedBuses={selectedBuses} busOptions={busOptions}
        filterOpen={filterOpen}
        onStartChange={setStartDate} onEndChange={setEndDate}
        onToggleFilter={() => setFilterOpen((v) => !v)}
        onToggleBus={toggleBus} onClearBuses={() => setSelectedBuses(new Set())}
      />

      {/* Chart — fills available height */}
      <div className="flex-1 rounded-2xl overflow-hidden bg-slate-900/50 border border-slate-700/40 shadow-xl min-h-[320px]">
        <KmChart data={data} isLoading={isFetching} />
      </div>

      {/* Per-bus KM summary */}
      <SummaryStats data={data} />
    </div>
  );
}
