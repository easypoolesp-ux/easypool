/**
 * usePlaybackHistory — GPS history playback with per-day chunked fetching.
 *
 * Architecture (Google/Uber GPS telemetry standard):
 *
 *   - Each calendar day is its own React Query cache entry.
 *   - Past days: staleTime = Infinity (data never changes) → zero re-fetches.
 *   - Today:     staleTime = 30s    (data grows throughout the day).
 *   - Range Mar24–Apr4 = 12 parallel requests, all small (~3k pts each).
 *   - Returns `dateBoundaries` for rendering date-change tick marks on slider.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { components } from "@/types/api";

type GPSPoint = components["schemas"]["GPSPoint"] & {
    location?: { type: string; coordinates: [number, number] };
};

export type DateBoundary = { date: string; index: number };

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

/** Today in IST as YYYY-MM-DD */
const todayIST = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Generate every calendar day between start and end inclusive */
function daysBetween(start: string, end: string): string[] {
    const days: string[] = [];
    const cur = new Date(`${start}T00:00:00+05:30`);
    const last = new Date(`${end}T00:00:00+05:30`);
    while (cur <= last) {
        days.push(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
}

// ── Per-day fetcher ────────────────────────────────────────────────────────────
async function fetchDay(
    busId: string,
    date: string,
    signal?: AbortSignal,
): Promise<GPSPoint[]> {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const res = await fetch(
        `${BACKEND_URL}/api/gps/playback?bus=${busId}&start_date=${date}&end_date=${date}`,
        { headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store" },
    );
    if (!res.ok) throw new Error(`GPS fetch failed for ${date}`);
    const raw: GPSPoint[] = await res.json();

    // Client-side enforcement: keep only points within this IST day
    const startMs = new Date(`${date}T00:00:00+05:30`).getTime();
    const endMs = new Date(`${date}T23:59:59.999+05:30`).getTime();
    return raw.filter((p) => {
        const t = new Date(p.timestamp).getTime();
        return t >= startMs && t <= endMs;
    });
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePlaybackHistory(
    selectedBusId: string | null,
    isHistoryMode: boolean,
) {
    const [playbackDate, setPlaybackDate] = useState(todayIST);
    const [playbackEndDate, setPlaybackEndDate] = useState(todayIST);
    const [playbackIndex, setPlaybackIndex] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const wasPlayingRef = useRef(false);

    // ── Date helpers ──────────────────────────────────────────────────────────
    const updateStartDate = useCallback((newStart: string) => {
        setPlaybackDate(newStart);
        setPlaybackEndDate((prev) => (prev < newStart ? newStart : prev));
        setPlaybackIndex(0);
        setIsPlaying(false);
    }, []);

    const updateEndDate = useCallback((newEnd: string) => {
        setPlaybackEndDate(newEnd);
        setPlaybackDate((prev) => (prev > newEnd ? newEnd : prev));
        setPlaybackIndex(0);
        setIsPlaying(false);
    }, []);

    // ── Per-day parallel queries ──────────────────────────────────────────────
    const today = todayIST();
    const days = useMemo(
        () => (isHistoryMode && selectedBusId ? daysBetween(playbackDate, playbackEndDate) : []),
        [isHistoryMode, selectedBusId, playbackDate, playbackEndDate],
    );

    const results = useQueries({
        queries: days.map((date) => ({
            queryKey: ["gps-day", selectedBusId, date] as const,
            queryFn: ({ signal }: { signal?: AbortSignal }) =>
                fetchDay(selectedBusId!, date, signal),
            enabled: isHistoryMode && !!selectedBusId,
            // Past days never change → permanent cache (zero re-fetches).
            // Today's data grows → 30s staleTime.
            staleTime: date < today ? Infinity : 30_000,
            gcTime: date < today ? Infinity : 60_000,
        })),
    });

    const isHistoryLoading = results.some((r) => r.isFetching);

    // ── Merge days in order + compute date boundaries ─────────────────────────
    const { historyPoints, dateBoundaries } = useMemo(() => {
        const points: GPSPoint[] = [];
        const boundaries: DateBoundary[] = [];
        results.forEach((r, i) => {
            if ((r.data?.length ?? 0) > 0) {
                if (i > 0) boundaries.push({ date: days[i], index: points.length });
                points.push(...(r.data ?? []));
            }
        });
        return { historyPoints: points, dateBoundaries: boundaries };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results.map((r) => r.dataUpdatedAt).join(","), days.join(",")]);

    // ── Playback timer ────────────────────────────────────────────────────────
    const idxRef = useRef(playbackIndex);
    const lenRef = useRef(historyPoints.length);
    useEffect(() => { idxRef.current = playbackIndex; }, [playbackIndex]);
    useEffect(() => { lenRef.current = historyPoints.length; }, [historyPoints.length]);

    useEffect(() => {
        if (!isPlaying) return;
        const t = setInterval(() => {
            if (idxRef.current >= lenRef.current - 1) { setIsPlaying(false); return; }
            setPlaybackIndex((v) => v + 1);
        }, 500 / playbackSpeed);
        return () => clearInterval(t);
    }, [isPlaying, playbackSpeed]);

    // ── Speed cycle ───────────────────────────────────────────────────────────
    const SPEEDS = [1, 2, 4, 8] as const;
    const cycleSpeed = useCallback(() => {
        setPlaybackSpeed((prev) => {
            const i = SPEEDS.indexOf(prev as (typeof SPEEDS)[number]);
            return SPEEDS[(i + 1) % SPEEDS.length];
        });
    }, []);

    return {
        playbackDate, playbackEndDate, updateStartDate, updateEndDate, todayIST,
        playbackIndex, setPlaybackIndex, playbackSpeed, cycleSpeed,
        isPlaying, setIsPlaying, wasPlayingRef,
        historyPoints, dateBoundaries, isHistoryLoading,
        currentPoint: historyPoints[playbackIndex] ?? null,
    } as const;
}
