import { paths } from "@/types/api";

type HttpMethod = "get" | "post" | "put" | "delete" | "patch";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Industry-standard typed API client for EasyPool.
 * Handles authentication, base URL, and type-safety via OpenAPI.
 */
export async function apiRequest<
  T extends keyof paths,
  M extends HttpMethod & keyof paths[T]
>(
  path: T,
  method: M,
  options?: {
    params?: any; // query or path params
    body?: any;
    headers?: HeadersInit;
  }
): Promise<any> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  
  // Build URL with query params
  let url = `${BASE_URL}${path}`;
  if (options?.params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        query.append(key, String(value));
      }
    }
    const queryString = query.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const res = await fetch(url, {
    method: method.toUpperCase(),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401) {
      // Handle logout or refresh (future)
      console.warn("Unauthorized API call");
    }
    throw new Error(`API Error ${res.status}: ${res.statusText}`);
  }

  return res.json();
}
