/**
 * useLiveTrails — Single-responsibility hook for live GPS trail overlays.
 *
 * Owns:  trail mode state, periodic fetching, client-side time-window trim.
 * Does NOT own: rendering polylines, map state, or UI toggle buttons.
 *
 * KEY FIX: client-side cutoff filter guarantees only points within the
 * requested window (2h / 24h) are kept, regardless of what the backend returns.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { components } from "@/types/api";

type GPSPoint = components["schemas"]["GPSPoint"] & {
    location?: { type: string; coordinates: [number, number] };
};

type TrailMode = "off" | "2h" | "today";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";
const POLL_INTERVAL = 30_000; // 30 seconds
const MAX_BUSES = 10; // cap to avoid hammering the API

interface Bus {
    id: string;
    lat?: number;
    lng?: number;
    location?: { type: string; coordinates: [number, number] } | null;
}

export function useLiveTrails(buses: Bus[], isLoaded: boolean) {
    const [liveTrailMode, setLiveTrailMode] = useState<TrailMode>("off");
    const [liveTrails, setLiveTrails] = useState<Map<string, GPSPoint[]>>(
        new Map(),
    );

    // Ref tracks the *current* mode so async fetches can bail if mode changed
    const modeRef = useRef(liveTrailMode);
    useEffect(() => {
        modeRef.current = liveTrailMode;
    }, [liveTrailMode]);

    // Convenience: cycle off → 2h → today → off
    const cycleTrailMode = () => {
        setLiveTrailMode((prev) => {
            if (prev === "off") return "2h";
            if (prev === "2h") return "today";
            return "off";
        });
    };

    useEffect(() => {
        if (liveTrailMode === "off" || !isLoaded) {
            setLiveTrails(new Map());
            return;
        }

        // Clear immediately so stale data (e.g. 24h) doesn't linger
        setLiveTrails(new Map());

        const fetchTrails = async () => {
            const token = localStorage.getItem("token");
            const mode = modeRef.current;
            if (mode === "off") return;

            const hours = mode === "2h" ? 2 : 24;
            const cutoff = new Date(Date.now() - hours * 3_600_000);

            const subset = buses
                .filter(
                    (b) => b.location != null || (b.lat != null && b.lng != null),
                )
                .slice(0, MAX_BUSES);

            const result = new Map<string, GPSPoint[]>();

            await Promise.all(
                subset.map(async (bus) => {
                    try {
                        const res = await fetch(
                            `${BACKEND_URL}/api/gps/playback?bus=${bus.id}&hours=${hours}`,
                            { headers: { Authorization: `Bearer ${token}` } },
                        );
                        if (!res.ok) return;
                        let pts: GPSPoint[] = await res.json();
                        // Client-side enforcement: only keep points within the window
                        pts = pts.filter((p) => new Date(p.timestamp) >= cutoff);
                        if (pts.length > 0) result.set(bus.id, pts);
                    } catch {
                        /* network error — skip this bus */
                    }
                }),
            );

            // Only commit if mode hasn't changed while we were fetching
            if (modeRef.current === mode) setLiveTrails(result);
        };

        fetchTrails();
        const interval = setInterval(fetchTrails, POLL_INTERVAL);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, liveTrailMode]);

    return {
        liveTrailMode,
        setLiveTrailMode,
        cycleTrailMode,
        liveTrails,
    } as const;
}
