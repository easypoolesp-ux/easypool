import { components } from "@/types/api";

type BusList = components["schemas"]["BusList"];
type GPSPoint = components["schemas"]["GPSPoint"];

// All API calls use relative paths — routed through Next.js reverse proxy to the backend
const BASE_URL = "";

async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  // Handle DRF pagination: return 'results' if it exists, otherwise the data itself
  return data.results !== undefined ? data.results : data;
}

export const fetchBuses = () => apiFetch<BusList[]>("/api/buses");

export const fetchBusLocation = (busId: string) =>
  apiFetch<GPSPoint>(`/api/gps/${busId}/latest`);
