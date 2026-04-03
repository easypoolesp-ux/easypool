"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { GoogleMap, useJsApiLoader, Polyline } from "@react-google-maps/api";
import {
  Play,
  Pause,
  X,
  Route,
  Calendar,
  Crosshair,
  Maximize,
  Unlock,
  FastForward,
} from "lucide-react";
import { useTheme } from "next-themes";
import { MONOCHROME_DARK, MONOCHROME_LIGHT, DARK_DEFAULT } from "./mapStyles";
import { useMapHighContrastListener } from "@/hooks/useMapHighContrast";
import { getStatusColor } from "@/constants/fleetStatus";
import { usePlaybackHistory } from "@/hooks/usePlaybackHistory";
import { useLiveTrails } from "@/hooks/useLiveTrails";
import { components } from "@/types/api";

// ── Types ────────────────────────────────────────────────────────────────────
type Bus = components["schemas"]["BusList"] & {
  computed_status?: string;
  speed?: number;
  heading?: number;
  location?: { type: string; coordinates: [number, number] };
  last_heartbeat?: string;
};
type GPSPoint = components["schemas"]["GPSPoint"] & {
  location?: { type: string; coordinates: [number, number] };
};

interface Props {
  buses: Bus[];
  isFullscreen?: boolean;
  initialBusId?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const getLatLng = (obj: {
  lat?: number;
  lng?: number;
  location?: { coordinates: [number, number] };
}) => {
  if (obj.location?.coordinates) {
    return {
      lat: obj.location.coordinates[1],
      lng: obj.location.coordinates[0],
    };
  }
  return { lat: obj.lat || 0, lng: obj.lng || 0 };
};

// ── Constants ────────────────────────────────────────────────────────────────
const MAP_CENTER = { lat: 22.5726, lng: 88.3639 };
const LIBRARIES: ("marker" | "maps" | "places")[] = ["marker"];

// ── Marker SVG builder ──────────────────────────────────────────────────────
function buildMarkerSvg(
  color: string,
  heading: number,
  isMoving: boolean,
): string {
  const beamId = `beam-${color.replace("#", "")}`;
  const svg = `<svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${beamId}" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.4" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${isMoving
      ? `
      <!-- Soft heading beam (FOV) -->
      <g transform="rotate(${heading}, 40, 40)">
        <path d="M40,40 L16,4 A36,36 0 0,1 64,4 Z" fill="url(#${beamId})"/>
      </g>`
      : ""
    }
      <!-- Main Marker -->
      <circle cx="40" cy="40" r="14" fill="${color}" stroke="white" stroke-width="3"/>
      <!-- Inner core highlight -->
      <circle cx="40" cy="40" r="5" fill="white" opacity="0.9"/>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function FleetMap({ buses, initialBusId }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey!,
    id: "google-map-script",
    libraries: LIBRARIES,
  });

  // Theme
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted
    ? (theme === "system" ? systemTheme : theme) === "dark"
    : false;
  const highContrast = useMapHighContrastListener();

  // Core state
  const [isHistoryMode, setIsHistoryMode] = useState(false);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(
    initialBusId || null,
  );
  const [cameraMode, setCameraMode] = useState<"free" | "follow" | "overview">(
    "free",
  );
  const [isMapReady, setIsMapReady] = useState(false);

  // ── Delegated hooks ────────────────────────────────────────────────────────
  const playback = usePlaybackHistory(selectedBusId, isHistoryMode);
  const trails = useLiveTrails(buses, isLoaded);

  // Destructure for readability in JSX
  const {
    playbackDate,
    playbackEndDate,
    updateStartDate,
    updateEndDate,
    todayIST,
    playbackIndex,
    setPlaybackIndex,
    playbackSpeed,
    cycleSpeed,
    isPlaying,
    setIsPlaying,
    wasPlayingRef,
    historyPoints,
    isHistoryLoading,
    currentPoint,
  } = playback;

  const { liveTrailMode, cycleTrailMode, liveTrails } = trails;

  // ── Refs ───────────────────────────────────────────────────────────────────
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRefs = useRef<Map<string, google.maps.Marker>>(new Map());
  const markerStateRefs = useRef<Map<string, string>>(new Map());
  const historyMarkerRef = useRef<google.maps.Marker | null>(null);
  const historyAnimationRef = useRef<number | undefined>(undefined);
  const lastHistoryPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const historyFitDoneRef = useRef<GPSPoint[] | null>(null);
  const animationRefs = useRef<Map<string, number>>(new Map());
  const currentPosRefs = useRef<Map<string, { lat: number; lng: number }>>(
    new Map(),
  );

  // Map options
  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: highContrast
        ? isDark
          ? MONOCHROME_DARK
          : MONOCHROME_LIGHT
        : isDark
          ? DARK_DEFAULT
          : [],
    }),
    [isDark, highContrast],
  );

  // Sync theme to live map
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setOptions({
        styles: highContrast
          ? isDark
            ? MONOCHROME_DARK
            : MONOCHROME_LIGHT
          : isDark
            ? DARK_DEFAULT
            : [],
      });
    }
  }, [isDark, highContrast]);

  // ── Marker management ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !isMapReady || !mapRef.current) return;
    if (isHistoryMode) {
      markerRefs.current.forEach((m) => m.setMap(null));
      markerRefs.current.clear();
      markerStateRefs.current.clear();
      return;
    }

    // Remove stale
    const ids = new Set(buses.map((b) => b.id));
    markerRefs.current.forEach((m, id) => {
      if (!ids.has(id)) {
        m.setMap(null);
        markerRefs.current.delete(id);
        markerStateRefs.current.delete(id);
      }
    });

    buses.forEach((bus) => {
      if (!bus.location && (bus.lat == null || bus.lng == null)) return;
      const effectiveStatus = bus.computed_status || bus.status || "offline";
      const color = getStatusColor(effectiveStatus);
      const heading = bus.heading || 0;
      const pos = getLatLng(bus);
      const isMoving = effectiveStatus === "moving";

      const stateHash = `${pos.lat},${pos.lng},${effectiveStatus},${heading},${isDark}`;
      if (markerStateRefs.current.get(bus.id) === stateHash) return;
      markerStateRefs.current.set(bus.id, stateHash);

      const iconUrl = buildMarkerSvg(color, heading, isMoving);
      const iconSize = new google.maps.Size(80, 80);
      const iconAnchor = new google.maps.Point(40, 40);

      const existing = markerRefs.current.get(bus.id);
      if (existing) {
        // Smooth position transition
        const ANIM_DURATION = 800;
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
        const pendingRaf = animationRefs.current.get(bus.id);
        if (pendingRaf !== undefined) cancelAnimationFrame(pendingRaf);

        const from =
          currentPosRefs.current.get(bus.id) ??
          (existing.getPosition()
            ? {
              lat: existing.getPosition()!.lat(),
              lng: existing.getPosition()!.lng(),
            }
            : pos);
        const to = pos;
        const startTime = performance.now();

        const animate = (now: number) => {
          const t = Math.min((now - startTime) / ANIM_DURATION, 1);
          const ease = easeOutCubic(t);
          const interpPos = {
            lat: from.lat + (to.lat - from.lat) * ease,
            lng: from.lng + (to.lng - from.lng) * ease,
          };
          existing.setPosition(interpPos);
          if (t < 1) {
            animationRefs.current.set(bus.id, requestAnimationFrame(animate));
          } else {
            currentPosRefs.current.set(bus.id, to);
            animationRefs.current.delete(bus.id);
          }
        };
        animationRefs.current.set(bus.id, requestAnimationFrame(animate));

        existing.setIcon({
          url: iconUrl,
          scaledSize: iconSize,
          anchor: iconAnchor,
          labelOrigin: new google.maps.Point(40, 72),
        });
        existing.setLabel({
          text: bus.internal_id,
          color: isDark ? "#ffffff" : "#0f172a",
          fontSize: "10px",
          fontWeight: "bold",
          className: "bus-map-label",
        });
      } else {
        const m = new google.maps.Marker({
          map: mapRef.current!,
          position: pos,
          title: bus.internal_id,
          icon: {
            url: iconUrl,
            scaledSize: iconSize,
            anchor: iconAnchor,
            labelOrigin: new google.maps.Point(40, 72),
          },
          label: {
            text: bus.internal_id,
            color: isDark ? "#ffffff" : "#0f172a",
            fontSize: "10px",
            fontWeight: "bold",
            className: "bus-map-label",
          },
        });
        m.addListener("click", () => {
          setSelectedBusId(bus.id);
          setCameraMode("follow");
        });
        markerRefs.current.set(bus.id, m);
        currentPosRefs.current.set(bus.id, pos);
      }
    });

    // Camera Mode Logic
    if (mapRef.current && !isHistoryMode) {
      if (cameraMode === "follow" && selectedBusId) {
        const target = buses.find((b) => b.id === selectedBusId);
        if (target) {
          const targetPos = getLatLng(target);
          if (targetPos.lat !== 0) {
            mapRef.current.panTo(targetPos);
            if ((mapRef.current.getZoom() ?? 0) < 15)
              mapRef.current.setZoom(15);
          }
        }
      } else if (cameraMode === "overview") {
        const valid = buses.filter(
          (b) => b.location != null || (b.lat != null && b.lng != null),
        );
        if (valid.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          valid.forEach((v) => bounds.extend(getLatLng(v)));
          mapRef.current.setOptions({ maxZoom: 15 });
          mapRef.current.fitBounds(bounds, 80);
          google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
            mapRef.current?.setOptions({ maxZoom: undefined });
          });
        }
        setCameraMode("free");
      }
    }
  }, [isLoaded, isMapReady, buses, isHistoryMode, isDark, cameraMode, selectedBusId]);

  // ── Playback Marker + Animation ───────────────────────────────────────────
  useEffect(() => {
    if (!isHistoryMode || !historyPoints[playbackIndex] || !mapRef.current) {
      if (historyAnimationRef.current)
        cancelAnimationFrame(historyAnimationRef.current);
      historyAnimationRef.current = undefined;
      historyMarkerRef.current?.setMap(null);
      historyMarkerRef.current = null;
      lastHistoryPosRef.current = null;
      return;
    }

    const pt = historyPoints[playbackIndex];
    const pos = pt.location
      ? { lat: pt.location.coordinates[1], lng: pt.location.coordinates[0] }
      : { lat: pt.lat, lng: pt.lng };

    if (!historyMarkerRef.current) {
      historyMarkerRef.current = new google.maps.Marker({
        map: mapRef.current!,
        position: pos,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
          scale: 11,
        },
        zIndex: 1000,
      });
      lastHistoryPosRef.current = pos;
    } else if (isPlaying) {
      const ANIM_DURATION = Math.max(50, (500 / playbackSpeed) * 0.85);
      if (ANIM_DURATION <= 50) {
        if (historyAnimationRef.current) {
          cancelAnimationFrame(historyAnimationRef.current);
          historyAnimationRef.current = undefined;
        }
        historyMarkerRef.current.setPosition(pos);
        lastHistoryPosRef.current = pos;
      } else {
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
        if (historyAnimationRef.current) {
          cancelAnimationFrame(historyAnimationRef.current);
          historyAnimationRef.current = undefined;
        }
        const from = lastHistoryPosRef.current ?? pos;
        const to = pos;
        const startTime = performance.now();
        const animate = (now: number) => {
          if (!historyMarkerRef.current) return;
          const t = Math.min((now - startTime) / ANIM_DURATION, 1);
          const ease = easeOutCubic(t);
          const current = {
            lat: from.lat + (to.lat - from.lat) * ease,
            lng: from.lng + (to.lng - from.lng) * ease,
          };
          historyMarkerRef.current.setPosition(current);
          lastHistoryPosRef.current = current;
          if (t < 1) {
            historyAnimationRef.current = requestAnimationFrame(animate);
          } else {
            historyAnimationRef.current = undefined;
          }
        };
        historyAnimationRef.current = requestAnimationFrame(animate);
      }
    } else {
      // Manual scrub — snap
      if (historyAnimationRef.current) {
        cancelAnimationFrame(historyAnimationRef.current);
        historyAnimationRef.current = undefined;
      }
      historyMarkerRef.current.setPosition(pos);
      lastHistoryPosRef.current = pos;
    }

    if (isPlaying && cameraMode === "follow") mapRef.current.panTo(pos);
  }, [playbackIndex, isHistoryMode, historyPoints, isPlaying, playbackSpeed, cameraMode]);

  // Fit bounds on new history data (once per dataset)
  useEffect(() => {
    if (
      isHistoryMode &&
      historyPoints.length > 0 &&
      mapRef.current &&
      historyFitDoneRef.current !== historyPoints
    ) {
      historyFitDoneRef.current = historyPoints;
      const bounds = new google.maps.LatLngBounds();
      historyPoints.forEach((p) => bounds.extend(getLatLng(p)));
      mapRef.current.setOptions({ maxZoom: 15 });
      mapRef.current.fitBounds(bounds, 50);
      google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
        mapRef.current?.setOptions({ maxZoom: undefined });
      });
    }
    if (!isHistoryMode) historyFitDoneRef.current = null;
  }, [historyPoints, isHistoryMode]);

  // ── Toggle history mode ───────────────────────────────────────────────────
  const toggleHistoryMode = useCallback(
    (bid?: string) => {
      if (isHistoryMode && !bid) {
        setIsHistoryMode(false);
        return;
      }
      const id = bid || selectedBusId || buses[0]?.id;
      if (!id) return;
      setSelectedBusId(id);
      setIsHistoryMode(true);
      setPlaybackIndex(0);
    },
    [isHistoryMode, selectedBusId, buses, setPlaybackIndex],
  );

  // External events
  useEffect(() => {
    const h = (e: any) => {
      setSelectedBusId(e.detail);
      setCameraMode("follow");
    };
    window.addEventListener("map:focusBus", h);
    return () => window.removeEventListener("map:focusBus", h);
  }, []);

  useEffect(() => {
    const h = (e: any) => toggleHistoryMode(e.detail);
    window.addEventListener("map:viewHistory", h);
    return () => window.removeEventListener("map:viewHistory", h);
  }, [toggleHistoryMode]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadError)
    return (
      <div className="p-8 text-red-500 text-sm font-bold">
        ⚠️ Maps failed to load. Check API Key.
      </div>
    );
  if (!isLoaded)
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900 rounded-xl">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={MAP_CENTER}
        zoom={12}
        onLoad={(m) => {
          mapRef.current = m;
          setIsMapReady(true);
        }}
        options={mapOptions}
      >
        {/* Live Trails — blue dashed */}
        {liveTrailMode !== "off" &&
          Array.from(liveTrails.values()).map((trail, i) => (
            <Polyline
              key={`trail-${i}`}
              path={trail.map((p) => getLatLng(p))}
              options={{
                strokeColor: "#3b82f6",
                strokeOpacity: 0,
                icons: [
                  {
                    icon: {
                      path: "M 0,-1 0,1",
                      strokeOpacity: 0.85,
                      scale: 5,
                      strokeWeight: 5,
                    },
                    offset: "0",
                    repeat: "18px",
                  },
                ],
              }}
            />
          ))}

        {/* History playback line */}
        {isHistoryMode && historyPoints.length > 1 && (
          <Polyline
            path={historyPoints.map((p) => getLatLng(p))}
            options={{
              strokeColor: "#3b82f6",
              strokeWeight: 3,
              strokeOpacity: 0.75,
            }}
          />
        )}
      </GoogleMap>

      {/* Map Control Buttons */}
      <div className="absolute top-[68px] right-4 z-10 flex flex-col gap-2">
        <button
          onClick={() =>
            setCameraMode((prev) => (prev === "free" ? "follow" : "free"))
          }
          className={`p-3 relative rounded-xl shadow-lg backdrop-blur-md transition-all active:scale-95 ${cameraMode === "follow"
            ? "bg-blue-600 text-white shadow-blue-500/20"
            : "bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white"
            }`}
          title={
            cameraMode === "free" ? "Enable Auto-Track" : "Disable Auto-Track"
          }
        >
          {cameraMode === "free" ? (
            <Unlock size={20} />
          ) : (
            <Crosshair size={20} className="animate-pulse" />
          )}
          {cameraMode === "follow" && (
            <span className="absolute -bottom-1 -right-1 bg-white text-blue-600 text-[7px] font-bold px-1 rounded-sm shadow-sm border border-blue-100">
              LOCK
            </span>
          )}
        </button>
        <button
          onClick={() => setCameraMode("overview")}
          className="p-3 relative rounded-xl shadow-lg backdrop-blur-md transition-all active:scale-95 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white"
          title="Fit All Buses"
        >
          <Maximize size={20} />
        </button>
        <button
          onClick={cycleTrailMode}
          className={`p-3 relative rounded-xl shadow-lg backdrop-blur-md transition-all active:scale-95 ${liveTrailMode !== "off" ? "bg-blue-600 text-white shadow-blue-500/20" : "bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white"}`}
          title={`Live Trail: ${liveTrailMode === "off" ? "Off" : liveTrailMode === "2h" ? "Last 2 Hours" : "Last 24 Hours"}`}
        >
          <Route
            size={20}
            className={liveTrailMode !== "off" ? "animate-pulse" : ""}
          />
          {liveTrailMode !== "off" && (
            <span className="absolute -bottom-1 -right-1 bg-white text-blue-600 text-[8px] font-bold px-1 rounded-sm shadow-sm border border-blue-100">
              {liveTrailMode === "2h" ? "2H" : "24H"}
            </span>
          )}
        </button>
        <button
          onClick={() => toggleHistoryMode()}
          className={`p-3 rounded-xl shadow-lg backdrop-blur-md transition-all active:scale-95 ${isHistoryMode ? "bg-blue-600 text-white" : "bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white"}`}
          title={isHistoryMode ? "Exit History" : "History Playback"}
        >
          {isHistoryMode ? <X size={20} /> : <Calendar size={20} />}
        </button>
      </div>

      {/* History Controls (date + bus picker) */}
      {isHistoryMode && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl shadow-xl border border-white/10">
          <Calendar size={14} className="text-blue-500 ml-2" />
          <input
            type="date"
            value={playbackDate}
            max={playbackEndDate}
            onChange={(e) => updateStartDate(e.target.value)}
            className="bg-transparent text-xs font-bold border-none focus:ring-0 p-0 text-slate-800 dark:text-white cursor-pointer"
          />
          <span className="text-slate-400 text-xs">→</span>
          <input
            type="date"
            value={playbackEndDate}
            min={playbackDate}
            max={todayIST()}
            onChange={(e) => updateEndDate(e.target.value)}
            className="bg-transparent text-xs font-bold border-none focus:ring-0 p-0 text-slate-800 dark:text-white cursor-pointer pr-2"
          />
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <select
            value={selectedBusId || ""}
            onChange={(e) => {
              setSelectedBusId(e.target.value);
              setPlaybackIndex(0);
            }}
            className="bg-transparent text-xs font-bold border-none focus:ring-0 py-1 px-2 text-slate-800 dark:text-white cursor-pointer"
          >
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.internal_id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Google Maps dark-mode InfoWindow fix */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
                .gm-ui-hover-effect {
                    background: #ffffffdd !important;
                    border-radius: 50% !important;
                    margin: 8px !important;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
                    padding: 4px !important;
                    display: block !important;
                    width: 32px !important;
                    height: 32px !important;
                    transition: all 0.2s !important;
                    opacity: 1 !important;
                    visibility: visible !important;
                }
                .gm-ui-hover-effect:hover {
                    background: #ffffffff !important;
                    transform: scale(1.1);
                }
                .gm-ui-hover-effect img, .gm-ui-hover-effect svg {
                    filter: brightness(0) !important;
                    width: 14px !important;
                    height: 14px !important;
                }
            `,
        }}
      />

      {/* Playback Timeline */}
      {isHistoryMode && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[92%] max-w-[420px] z-50">
          <div className="bg-slate-900/92 backdrop-blur-2xl p-4 rounded-3xl shadow-2xl border border-white/10 text-white flex flex-col gap-3">
            {isHistoryLoading && historyPoints.length === 0 ? (
              <div className="flex items-center justify-center py-3">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : historyPoints.length === 0 ? (
              <p className="text-center text-slate-400 text-xs italic py-1">
                No data for this date
              </p>
            ) : (
              <>
                {/* Dataset summary */}
                {(() => {
                  const first = historyPoints[0];
                  const last = historyPoints[historyPoints.length - 1];
                  const fmtShort = (ts: string) =>
                    new Date(ts).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  return (
                    <div className="flex items-center justify-between text-[10px] text-white/40 font-medium px-0.5">
                      <span className="truncate">
                        {first ? fmtShort(first.timestamp) : ""}
                        {last && last !== first
                          ? ` → ${fmtShort(last.timestamp)}`
                          : ""}
                      </span>
                      <span>
                        {playbackIndex + 1}/{historyPoints.length}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-3 bg-blue-500 hover:bg-blue-400 text-white rounded-2xl shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                  >
                    {isPlaying ? (
                      <Pause size={18} fill="currentColor" />
                    ) : (
                      <Play size={18} fill="currentColor" />
                    )}
                  </button>

                  <button
                    onClick={cycleSpeed}
                    className="p-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-1.5 border border-white/10"
                    title={`Playback Speed: x${playbackSpeed}`}
                  >
                    <FastForward
                      size={16}
                      fill={playbackSpeed > 1 ? "currentColor" : "none"}
                      className={
                        playbackSpeed > 1 ? "text-blue-400" : "text-white"
                      }
                    />
                    <span className="text-[11px] font-black w-5 tracking-tighter">
                      x{playbackSpeed}
                    </span>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-blue-300 truncate">
                      {currentPoint
                        ? new Date(currentPoint.timestamp).toLocaleString(
                          "en-IN",
                          {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          },
                        )
                        : "—"}
                    </p>
                    <p className="text-[11px] text-white/60 font-semibold">
                      {currentPoint
                        ? `${Math.round(currentPoint.speed || 0)} km/h`
                        : "—"}
                    </p>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, historyPoints.length - 1)}
                  value={playbackIndex}
                  onPointerDown={() => {
                    wasPlayingRef.current = isPlaying;
                    if (isPlaying) setIsPlaying(false);
                  }}
                  onPointerUp={() => {
                    if (wasPlayingRef.current) setIsPlaying(true);
                    wasPlayingRef.current = false;
                  }}
                  onChange={(e) => setPlaybackIndex(Number(e.target.value))}
                  className="w-full accent-blue-500 h-1.5 rounded-full cursor-pointer"
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
