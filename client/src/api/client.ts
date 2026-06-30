import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/authStore";

const API_BASE_URL = "http://localhost:4000/api/v1";

/* ------------------------------------------------------------------ *
 * Refresh-token queue
 * ------------------------------------------------------------------ *
 * When N concurrent requests get a 401 at the same time, we MUST issue
 * exactly ONE /auth/refresh call. Without this queue, each failing
 * request would trigger its own refresh — the second one would either
 * fail (cookie already used by a parallel call) or rotate the access
 * token multiple times, and the requests would all replay with the
 * wrong token.
 *
 * Flow: first 401 starts the refresh and sets `isRefreshing`. The next
 * N-1 401s join `failedQueue` and wait. When the in-flight refresh
 * resolves, we replay the queue with the new token.
 */
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  failedQueue = [];
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

/* Request interceptor: attach access token from in-memory store */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

/* Response interceptor: 401 → /auth/refresh → retry, exactly once */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    // Bail: not a 401, no config, already retried, or this IS the refresh call.
    if (
      !originalRequest ||
      error.response?.status !== 401 ||
      originalRequest._retry ||
      originalRequest.url?.endsWith("/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    // Queue behind an in-flight refresh.
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((newToken) => {
        originalRequest.headers.set("Authorization", `Bearer ${newToken}`);
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Use bare axios.post (NOT api.post) to avoid re-entering this interceptor.
      // Belt-and-suspenders: the `url?.endsWith("/auth/refresh")` guard above
      // already prevents recursion, but going through the bare client is the
      // second line of defense if a future refactor removes the guard.
      const { data } = await axios.post<{ success: true; accessToken: string }>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      );

      const newAccessToken = data.accessToken;
      useAuthStore.getState().setAccessToken(newAccessToken);
      processQueue(null, newAccessToken);

      originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      useAuthStore.getState().clear();
      // Interceptor runs outside React's render cycle, so we can't safely call
      // useNavigate() here. Full-page nav is fine for a hard logout. FE-2
      // replaces this with a softer redirect from inside a React effect.
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
