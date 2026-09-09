import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

const REFRESH_NATIVE_PATH = "/refresh";
const AUTH_NATIVE_PATHS = [REFRESH_NATIVE_PATH, "/commonLogin", "/logout"];

let refreshPromise: Promise<boolean> | null = null;

function isNativePath(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_NATIVE_PATHS.some((p) => url.startsWith(p));
}

export async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await axios.post(
        `${API_BASE}${REFRESH_NATIVE_PATH}`,
        {},
        { withCredentials: true, timeout: 15000 },
      );
      return res.status === 200;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    if (
      status === 401 &&
      original &&
      !original._retry &&
      !isNativePath(original.url)
    ) {
      original._retry = true;
      const ok = await refreshSession();
      if (ok) {
        return api(original);
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("userId");
        localStorage.removeItem("userType");
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export interface ApiResponse<T = unknown> {
  status_code: number;
  message: string | null;
  error?: unknown;
  data?: T;
  projectDetail?: T;
}