import { useState, useEffect, useCallback, useRef } from "react";
import { components } from "@/types/api";
import { auth } from "@/lib/firebase";
import { fetchBuses as apiFetchBuses } from "@/lib/api";

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
      const data = await apiFetchBuses();
      // apiFetchBuses returns BusList[]
      setBuses(data);
      setLastUpdated(new Date());
      setError(null);

      // Cache results
      if (typeof window !== "undefined") {
        localStorage.setItem("cached_buses", JSON.stringify(data));
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Bus fetch error:", err);
        setError("Failed to fetch bus data. Please check your connection.");
      }
    } finally {
      setLoading((prev) => (prev ? false : prev));
      setTick((t) => t + 1);
    }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const ts = Date.now();

      const alertRes = await fetch(`/api/alerts?_t=${ts}`, { headers });
      if (alertRes.ok) {
        const d = await alertRes.json();
        setAlerts(d.results || d);
      }
      // Note: transporters fetch skipped for now as it's not in schema
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
      busInterval = setInterval(() => {
        apiFetchBuses()
          .then((data) => {
            if (isMounted) {
              setBuses(data);
              setLastUpdated(new Date());
              if (typeof window !== "undefined") {
                localStorage.setItem("cached_buses", JSON.stringify(data));
              }
            }
          })
          .catch((err) => console.error("[useBusPolling] Polling error:", err));
      }, 10000);
    };

    const setupStream = async () => {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch(`/api/buses/stream`, { headers });
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

                setBuses((prevBuses) => {
                  const updated = prevBuses.map((b) =>
                    b.internal_id === data.imei
                      ? {
                        ...b,
                        // Update the GeoJSON location field — getLatLng() in
                        // FleetMap prefers this over flat lat/lng (backend
                        // migrated to single GeoJSON Point field).
                        location: {
                          type: "Point" as const,
                          coordinates: [data.lng, data.lat] as [number, number],
                        },
                        lat: data.lat,
                        lng: data.lng,
                        // Sync both field name conventions:
                        // FleetMap stateHash reads `heading`/`speed`
                        // while schema uses `latest_heading`/`latest_speed`.
                        heading: data.heading,
                        speed: data.speed,
                        latest_speed: data.speed,
                        latest_heading: data.heading,
                        latest_heartbeat: new Date(
                          data.timestamp * 1000,
                        ).toISOString(),
                        status: "online" as BusType["status"],
                      }
                      : b,
                  );
                  if (typeof window !== "undefined") {
                    localStorage.setItem("cached_buses", JSON.stringify(updated));
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
        console.warn("[useBusPolling] SSE Stream failed, falling back to polling.", err);
        if (isMounted) startPollingFallback();
      }
    };

    // 1. Initial complete fetch
    apiFetchBuses().then((data) => {
      setBuses(data);
      setLoading(false);
      setLastUpdated(new Date());
      setupStream();
    }).catch(() => {
      setLoading(false);
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
  }, [apiFetchBuses, fetchMeta]);

  return { buses, alerts, transporters, loading, error, lastUpdated };
}
