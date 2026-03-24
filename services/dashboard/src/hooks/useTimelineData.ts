import * as React from "react";
import { apiRequest } from "@/lib/apiClient";

export interface BusTimeline {
  bus_id: string;
  internal_id: string;
  series: { timestamp: string; cumulative_km: number }[];
}

export function useTimelineData(
  busIds: string[],
  startDate: string,
  endDate: string,
) {
  const [data, setData] = React.useState<BusTimeline[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setIsLoading(true);
      try {
        const sortedBusIds = [...busIds].sort();
        const busParam = sortedBusIds.length > 0 ? sortedBusIds.join(",") : "";
        
        const res = await apiRequest("/api/gps/timeline", "get", {
          params: {
            start: startDate,
            end: endDate,
            bus: busParam,
          },
        });

        if (isMounted) {
          setData(res);
        }
      } catch (err) {
        console.error("Timeline data error:", err);
        if (isMounted) {
          setData([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [busIds, startDate, endDate]);

  return { data, isLoading };
}
