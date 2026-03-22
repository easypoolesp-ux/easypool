import { useState, useEffect, useCallback, useRef } from "react";
import { components } from "@/types/api";
import { auth } from "@/lib/firebase";

type BusType = components["schemas"]["BusList"];
type AlertType = components["schemas"]["Alert"];

interface UseBusPollingReturn {
  buses: BusType[];
  alerts: AlertType[];
  transporters: any[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useBusPolling(): UseBusPollingReturn {
  const [buses, setBuses] = useState<BusType[]>([]);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [transporters, setTransporters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  // Refs for intervals and abort controllers
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBuses = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const user = auth.currentUser;
      const token = user
        ? await user.getIdToken()
        : typeof window !== "undefined"
          ? localStorage.getItem("token")
          : null;
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {};

      const res = await fetch(`/api/buses?_t=${Date.now()}`, {
        headers,
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        const results = data.results || data;
        setBuses(results);
        setLastUpdated(new Date());
        setError(null);

        // Cache results
        if (typeof window !== "undefined") {
          localStorage.setItem("cached_buses", JSON.stringify(results));
        }
      } else {
        setError(`Failed to fetch buses: ${res.statusText}`);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Bus fetch error:", err);
        setError("Failed to fetch bus data. Please check your connection.");
      }
    } finally {
      // Keep loading true on first mount, false on subsequent polls
      setLoading((prev) => (prev ? false : prev));
      setTick((t) => t + 1); // Force re-render to ensure relative times update
    }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const user = auth.currentUser;
      const token = user
        ? await user.getIdToken()
        : typeof window !== "undefined"
          ? localStorage.getItem("token")
          : null;
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {};
      const ts = Date.now();

      const [alertRes, transRes] = await Promise.all([
        fetch(`/api/alerts?_t=${ts}`, { headers }),
        fetch(`/api/transporters?_t=${ts}`, { headers }),
      ]);

      if (alertRes.ok) {
        const d = await alertRes.json();
        setAlerts(d.results || d);
      }
      if (transRes.ok) {
        const d = await transRes.json();
        setTransporters(d.results || d);
      }
    } catch (err) {
      console.error("Meta fetch error:", err);
    }
  }, []);

  useEffect(() => {
    // Load cached bus positions for instant display
    if (typeof window !== "undefined") {
      const cachedBuses = localStorage.getItem("cached_buses");
      if (cachedBuses) {
        try {
          setBuses(JSON.parse(cachedBuses));
        } catch (e) {
          console.error("Failed to parse cached buses:", e);
        }
      }
    }

    let busInterval: NodeJS.Timeout | null = null;
    let isStreamActive = false;
    let isMounted = true;

    const startPollingFallback = () => {
      if (busInterval) return;
      console.log("[useBusPolling] Falling back to 10s polling.");
      busInterval = setInterval(fetchBuses, 10000);
    };

    const setupStream = async () => {
      try {
        const user = auth.currentUser;
        const token = user
          ? await user.getIdToken()
          : typeof window !== "undefined"
            ? localStorage.getItem("token")
            : null;
        const headers: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const res = await fetch(`/api/buses/stream/`, { headers });
        if (!res.ok) throw new Error(`Stream HTTP Error ${res.status}`);

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        isStreamActive = true;

        console.log("[useBusPolling] SSE Stream Connected.");

        while (reader && isMounted) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.replace("data: ", "").trim();
              if (!dataStr) continue;
              try {
                const data = JSON.parse(dataStr);
                if (data.status === "connected") continue;
                if (data.error) continue;

                // Incoming Redis live update from Gateway
                setBuses((prevBuses) => {
                  const updated = prevBuses.map((b) =>
                    b.internal_id === data.imei
                      ? {
                          ...b,
                          latest_lat: data.lat,
                          latest_lng: data.lng,
                          latest_speed: data.speed,
                          latest_heading: data.heading,
                          latest_heartbeat: new Date(
                            data.timestamp * 1000,
                          ).toISOString(),
                          status: "online" as any,
                        }
                      : b,
                  );
                  if (typeof window !== "undefined") {
                    localStorage.setItem(
                      "cached_buses",
                      JSON.stringify(updated),
                    );
                  }
                  return updated;
                });
              } catch (e) {
                console.error("Error parsing SSE data:", e, dataStr);
              }
            }
          }
        }

        if (isMounted) startPollingFallback();
      } catch (err) {
        console.warn(
          "[useBusPolling] SSE Stream failed, falling back to polling.",
          err,
        );
        if (isMounted) startPollingFallback();
      }
    };

    // 1. Initial complete fetch to get all buses and routes
    fetchBuses().then(() => {
      // 2. Start the live stream
      setupStream();
    });

    fetchMeta();
    const metaInterval = setInterval(fetchMeta, 60000);

    // Cleanup
    return () => {
      isMounted = false;
      if (busInterval) clearInterval(busInterval);
      clearInterval(metaInterval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchBuses, fetchMeta]);

  return { buses, alerts, transporters, loading, error, lastUpdated };
}
