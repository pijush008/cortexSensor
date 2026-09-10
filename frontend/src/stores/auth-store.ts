import { create } from "zustand";
import { api, type ApiResponse } from "@/lib/api";
import type { UserRole } from "@/types";

interface AuthState {
  userId: number | null;
  userType: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<LoginOutcome>;
  verifyLoginOtp: (userId: number, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => void;
}

interface LoginPayload {
  status_code: number;
  message: string | null;
  userID?: number;
  type?: UserRole;
  /** Platform operators finish signing in with an emailed code. */
  otpRequired?: boolean;
}

export interface LoginOutcome {
  otpRequired: boolean;
  userId: number;
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

    // A code was mailed and NO session was issued. Marking the store
    // authenticated here would defeat the second factor: the app would render
    // as signed in while every API call still failed unauthenticated.
    if (result.otpRequired) {
      return { otpRequired: true, userId: result.userID };
    }

    localStorage.setItem("userId", String(result.userID));
    localStorage.setItem("userType", result.type);
    set({
      userId: result.userID,
      userType: result.type,
      isAuthenticated: true,
    });
    return { otpRequired: false, userId: result.userID };
  },

  /** Second step for a platform operator: the session is issued here. */
  verifyLoginOtp: async (userId: number, otp: string) => {
    const { data } = await api.post<ApiResponse<LoginPayload>>(
      "/commonLogin/otp",
      { userID: userId, otp },
    );
    const result = data as LoginPayload;
    if (result.status_code !== 200 || !result.userID || !result.type) {
      throw new Error(result.message || "Sign-in failed");
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