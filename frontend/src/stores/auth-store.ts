import { create } from "zustand";
import { api, type ApiResponse } from "@/lib/api";
import type { UserRole } from "@/types";

interface AuthState {
  userId: number | null;
  userType: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => void;
}

interface LoginPayload {
  status_code: number;
  message: string | null;
  userID?: number;
  type?: UserRole;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  userType: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (username: string, password: string) => {
    const { data } = await api.post<ApiResponse<LoginPayload>>(
      "/commonLogin",
      { username, password },
    );
    const result = data as LoginPayload;
    if (result.status_code !== 200 || !result.userID || !result.type) {
      throw new Error(result.message || "Login failed");
    }
    localStorage.setItem("userId", String(result.userID));
    localStorage.setItem("userType", result.type);
    set({
      userId: result.userID,
      userType: result.type,
      isAuthenticated: true,
    });
  },

  logout: async () => {
    try {
      await api.post("/logout", {});
    } catch {
      // ignore network errors on logout; local state is cleared regardless
    }
    localStorage.removeItem("userId");
    localStorage.removeItem("userType");
    set({ userId: null, userType: null, isAuthenticated: false });
  },

  initialize: () => {
    if (typeof window === "undefined") return;
    const userId = localStorage.getItem("userId");
    const userType = localStorage.getItem("userType") as UserRole | null;
    if (userId && userType) {
      set({
        userId: Number(userId),
        userType,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
  },
}));