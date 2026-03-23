import { useQuery } from "@tanstack/react-query";
import { KmPoint } from "@/lib/geoUtils";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://easypool-backend-222076803846.asia-south1.run.app";

export interface BusTimeline {
  bus_id: string;
  internal_id: string;
  series: KmPoint[];  // pre-computed by PostGIS
}

export function useTimelineData(
  startDate: string,
  endDate: string,
  selectedBuses: Set<string>
) {
  const busParam = selectedBuses.size > 0 ? Array.from(selectedBuses).join(",") : undefined;

  return useQuery<BusTimeline[]>({
    queryKey: ["gps-timeline", startDate, endDate, busParam],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({ start: startDate, end: endDate });
      if (busParam) params.set("bus", busParam);
      const res = await fetch(`${BACKEND_URL}/api/gps/timeline/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch timeline");
      return res.json();
    },
    staleTime: 60_000,
  });
}
