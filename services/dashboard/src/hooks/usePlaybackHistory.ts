/**
 * usePlaybackHistory — Single-responsibility hook for GPS history playback.
 *
 * Owns:  date state, playback index/speed/playing, React Query fetch, timer.
 * Does NOT own: map rendering, markers, camera, or UI components.
 *
 * KEY FIX: queryFn reads dates from `context.queryKey` — never from closure
 * state — so React Query always fetches the URL matching the cache key.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, type QueryFunctionContext } from "@tanstack/react-query";
import type { components } from "@/types/api";

type GPSPoint = components["schemas"]["GPSPoint"] & {
    location?: { type: string; coordinates: [number, number] };
};

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

/** Today in IST as YYYY-MM-DD */
const todayIST = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        new Date(),
    );

// ── Fetcher (uses queryKey, never closure state) ─────────────────────────────
type PlaybackKey = readonly [string, string | null, string, string];

async function fetchPlayback({
    queryKey,
}: QueryFunctionContext<PlaybackKey>): Promise<GPSPoint[]> {
    const [, busId, startDate, endDate] = queryKey;
    const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const res = await fetch(
        `${BACKEND_URL}/api/gps/playback?bus=${busId}&start_date=${startDate}&end_date=${endDate}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error("History fetch failed");
    return res.json();
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePlaybackHistory(
    selectedBusId: string | null,
    isHistoryMode: boolean,
) {
    // Date state
    const [playbackDate, setPlaybackDate] = useState(todayIST);
    const [playbackEndDate, setPlaybackEndDate] = useState(todayIST);

    // Playback state
    const [playbackIndex, setPlaybackIndex] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);

    // Scrub support: remember if playback was active before user grabbed slider
    const wasPlayingRef = useRef(false);

    // ── Date helpers (auto-clamp the other bound) ────────────────────────────
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

    // ── React Query ──────────────────────────────────────────────────────────
    const queryKey = [
        "gps-playback",
        selectedBusId,
        playbackDate,
        playbackEndDate,
    ] as const;

    const { data: historyPoints = [], isFetching: isHistoryLoading } = useQuery<
        GPSPoint[],
        Error,
        GPSPoint[],
        PlaybackKey
    >({
        queryKey,
        queryFn: fetchPlayback, // uses queryKey context — closure-proof
        enabled: isHistoryMode && !!selectedBusId,
        staleTime: playbackEndDate === todayIST() ? 30_000 : 2 * 60_000,
    });

    // ── Playback timer ───────────────────────────────────────────────────────
    // Refs so the interval doesn't need to restart on every index change.
    const idxRef = useRef(playbackIndex);
    const lenRef = useRef(historyPoints.length);
    useEffect(() => {
        idxRef.current = playbackIndex;
    }, [playbackIndex]);
    useEffect(() => {
        lenRef.current = historyPoints.length;
    }, [historyPoints.length]);

    useEffect(() => {
        if (!isPlaying) return;
        const t = setInterval(() => {
            if (idxRef.current >= lenRef.current - 1) {
                setIsPlaying(false);
                return;
            }
            setPlaybackIndex((v) => v + 1);
        }, 500 / playbackSpeed);
        return () => clearInterval(t);
    }, [isPlaying, playbackSpeed]);

    // ── Speed cycle ──────────────────────────────────────────────────────────
    const SPEEDS = [1, 2, 4, 8] as const;
    const cycleSpeed = useCallback(() => {
        setPlaybackSpeed((prev) => {
            const i = SPEEDS.indexOf(prev as (typeof SPEEDS)[number]);
            return SPEEDS[(i + 1) % SPEEDS.length];
        });
    }, []);

    return {
        // Date
        playbackDate,
        playbackEndDate,
        updateStartDate,
        updateEndDate,
        todayIST,

        // Playback controls
        playbackIndex,
        setPlaybackIndex,
        playbackSpeed,
        cycleSpeed,
        isPlaying,
        setIsPlaying,

        // Scrub helpers
        wasPlayingRef,

        // Data
        historyPoints,
        isHistoryLoading,
        currentPoint: historyPoints[playbackIndex] ?? null,
    } as const;
}
