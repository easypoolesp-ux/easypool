"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bus,
  MapPin,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Search,
  LogOut,
  Filter,
  X,
  Clock,
  WifiOff,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { components } from "@/types/api";
import Image from "next/image";
import FleetStatusDonut from "@/components/fleet/FleetStatusDonut";
import AlertCenter from "@/components/fleet/AlertCenter";
import { getStatusConfig, FLEET_STATUSES } from "@/constants/fleetStatus";
import { useBusPolling } from "@/hooks/useBusPolling";

import UserProfile from "@/components/layout/UserProfile";

const FleetMap = nextDynamic(() => import("@/components/map/FleetMap"), {
  ssr: false,
});

type BusType = components["schemas"]["BusList"];

/**
 * Final Smart Time Logic:
 * (Date if over 24h), Time (H:M am/pm), and Relative (Xm ago)
 */
function formatTimeDisplay(timestamp?: string) {
  if (!timestamp) return "No Signal";
  const date = new Date(timestamp);
  const now = new Date();

  // 1. Check if different date
  const isToday = date.toDateString() === now.toDateString();
  const dateStr = isToday
    ? ""
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
      ", ";

  // 2. Exact Time
  const timeStr = date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // 3. Relative Time
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  let relative = "Just now";
  if (mins >= 1 && mins < 60) relative = `${mins}m ago`;
  else if (mins >= 60 && mins < 1440)
    relative = `${Math.floor(mins / 60)}h ago`;
  else if (mins >= 1440) relative = `${Math.floor(mins / 1440)}d ago`;

  return `${dateStr}${timeStr} (${relative})`;
}

/** Use computed_status from backend — colour/label from fleetStatus.ts */
const getStatusDisplay = (bus: any) => {
  const s = bus.computed_status || bus.status;
  const cfg = getStatusConfig(s);
  return {
    label: cfg.label,
    color: cfg.text,
    dot: s === "moving" ? `${cfg.dot} animate-pulse` : cfg.dot,
    speed: s === "moving" ? Math.round(bus.speed || 0) : null,
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const { buses, alerts, transporters, loading, error, lastUpdated } =
    useBusPolling();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleStatusFilter = (status: string) => {
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  // Filter out offline (untracked) buses — they don't belong on the live dashboard
  const activeBuses = useMemo(
    () =>
      buses.filter((b) => {
        const cs = (b as any).computed_status || b.status;
        return cs !== "offline";
      }),
    [buses],
  );

  const filteredBuses = useMemo(
    () =>
      activeBuses.filter((bus) => {
        const cs = (bus as any).computed_status || bus.status;
        if (hiddenStatuses.has(cs)) return false;
        return (
          bus.internal_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          bus.plate_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (bus.route_name || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
        );
      }),
    [activeBuses, hiddenStatuses, searchQuery],
  );

  if (!mounted)
    return <div className="p-6 text-center">Loading Dashboard...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50/50 dark:bg-transparent min-h-screen">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 overflow-hidden rounded-full border border-border shadow-md bg-white p-1.5 flex items-center justify-center">
            <div className="relative w-full h-full overflow-hidden rounded-full">
              <Image
                src="/logo.jpeg"
                alt="EasyPool Logo"
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>
          <div className="space-y-1 content-center">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Fleet Overview
              </h1>
              <Link
                href="/dashboard/analytics"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500/20 transition-all"
              >
                📈 Analytics
              </Link>
            </div>
          </div>
        </div>
        <UserProfile />
      </header>

      <div
        className={`grid grid-cols-1 ${isFullscreen ? "lg:grid-cols-1" : "lg:grid-cols-3"} gap-6 transition-all duration-500`}
      >
        {/* Main Fleet Map with Fullscreen Toggle */}
        <div
          className={`${isFullscreen ? "lg:col-span-1 fixed inset-4 z-50 bg-background shadow-2xl" : "lg:col-span-2 min-h-[500px] bg-muted relative shadow-inner"} rounded-xl overflow-hidden border border-border`}
        >
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="absolute top-4 right-4 z-20 p-3 bg-white/90 dark:bg-slate-800/90 rounded-xl shadow-2xl backdrop-blur-md hover:bg-white transition-all active:scale-95 border border-border group"
            title={isFullscreen ? "Exit Fullscreen" : "See Map in Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
            ) : (
              <Maximize2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
            )}
          </button>
          <FleetMap
            buses={filteredBuses.map((b) => ({
              id: (b as any).id,
              internal_id: b.internal_id,
              status: b.status || "offline",
              computed_status: (b as any).computed_status,
              lat: b.lat,
              lng: b.lng,
              location: (b as any).location,
              plate_number: b.plate_number,
              route_name: b.route_name,
              speed: (b as any).speed,
              heading: (b as any).heading,
            }))}
            isFullscreen={isFullscreen}
          />
        </div>

        {/* Bus Status List - Hide when map is fullscreen for focus */}
        {!isFullscreen && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col h-[500px]">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Bus className="w-5 h-5 text-primary" />
                  Fleet Status
                </h2>
                <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 mt-1">
                  {loading && !lastUpdated ? (
                    <span className="flex items-center gap-1 animate-pulse">
                      <Clock size={10} /> Loading...
                    </span>
                  ) : (
                    <span
                      className={`flex items-center gap-1 ${error ? "text-amber-500" : "text-emerald-600 dark:text-emerald-500"}`}
                      title={error || "Live Tracking"}
                    >
                      {error ? (
                        <WifiOff size={10} className="animate-pulse" />
                      ) : (
                        <Clock size={10} />
                      )}
                      Updated{" "}
                      {lastUpdated
                        ? formatTimeDisplay(lastUpdated.toISOString())
                        : "just now"}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-1.5 rounded-lg transition-all ${showFilters || hiddenStatuses.size > 0 ? "text-blue-600 bg-blue-500/10" : "text-muted-foreground hover:text-primary"}`}
                title="Filter by status"
              >
                <Filter className="w-4 h-4" />
                {hiddenStatuses.size > 0 && (
                  <span className="absolute -mt-3 ml-2 w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
              </button>
            </div>

            {/* ── Alert Dashboard ── */}
            <AlertCenter
              criticalBuses={activeBuses
                .filter(
                  (b) =>
                    ((b as any).computed_status || b.status) === "no_signal",
                )
                .map((b) => ({
                  id: (b as any).id,
                  internal_id: b.internal_id,
                  last_seen: (b as any).last_heartbeat,
                }))}
              onViewBus={(busId) =>
                window.dispatchEvent(
                  new CustomEvent("map:focusBus", { detail: busId }),
                )
              }
            />

            {/* ── Fleet Health Donut ── */}
            <FleetStatusDonut
              statuses={FLEET_STATUSES.map((s) => ({
                key: s.key,
                label: s.label,
                count: activeBuses.filter(
                  (b) => ((b as any).computed_status || b.status) === s.key,
                ).length,
                color: s.hex,
                tailwind: s.dot,
              }))}
            />

            {/* Search Bar */}
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Search Plate, ID, or Route..."
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status filter chips — toggled by filter button */}
            {showFilters && (
              <div className="flex flex-wrap gap-1.5">
                {FLEET_STATUSES.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => toggleStatusFilter(f.key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
                      hiddenStatuses.has(f.key)
                        ? "bg-transparent border-slate-200 dark:border-slate-700 text-slate-400 line-through opacity-50"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${f.dot} ${hiddenStatuses.has(f.key) ? "opacity-30" : ""}`}
                    />
                    {f.label}
                    <span className="text-[9px] opacity-50">
                      {
                        buses.filter(
                          (b) =>
                            ((b as any).computed_status || b.status) === f.key,
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {filteredBuses.length > 0 ? (
                filteredBuses.map((bus) => {
                  const st = getStatusDisplay(bus);
                  return (
                    <div key={bus.id} className="block group relative">
                      <Card
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent("map:focusBus", { detail: bus.id }),
                          )
                        }
                        className="hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer border-none shadow-sm bg-white dark:bg-slate-900"
                      >
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div
                              className={`p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 ${st.color}`}
                            >
                              <Bus className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold truncate flex items-center gap-1.5 tracking-tight">
                                {bus.internal_id}
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono font-normal">
                                  {bus.plate_number}
                                </span>
                              </h3>
                              <p className="text-[11px] text-muted-foreground truncate italic">
                                {bus.route_name || "No Route assigned"}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-[10px] pr-4">
                            <span
                              className={`${st.color} flex items-center gap-1.5 font-bold uppercase tracking-wider`}
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${st.dot}`}
                              />
                              {st.label}
                            </span>
                            {st.speed !== null && st.speed > 0 && (
                              <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                                {st.speed} km/h
                              </span>
                            )}
                            <span className="text-[9px] text-muted-foreground font-medium text-right leading-tight">
                              {formatTimeDisplay((bus as any).last_heartbeat)}
                            </span>
                          </div>
                          <Link
                            href={`/dashboard/bus/${bus.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 bg-white/80 dark:bg-slate-800 text-slate-500 hover:text-blue-500 rounded-md transition-all shadow-sm border border-slate-200 dark:border-slate-700"
                            title="View Bus Details"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 text-muted-foreground text-xs italic">
                  {searchQuery
                    ? `No buses matching "${searchQuery}"`
                    : "No vehicles mapped to your organisation"}
                </div>
              )}
            </div>

            {/* Emergency Alert Card - Dynamic from API */}
            {alerts
              .filter((a) => !a.is_resolved)
              .slice(0, 1)
              .map((alert) => (
                <Card
                  key={alert.id}
                  className="bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/10 border-none shadow-sm outline outline-1 outline-red-200 dark:outline-red-900/20 mt-auto animate-pulse"
                >
                  <CardContent className="p-4 flex gap-3 text-red-700 dark:text-red-400">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <div className="text-[10px]">
                      <p className="font-bold uppercase tracking-tighter text-red-600">
                        Urgent: {alert.type} - {alert.bus.internal_id}
                      </p>
                      <p className="opacity-80 font-medium leading-tight">
                        {alert.message}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
