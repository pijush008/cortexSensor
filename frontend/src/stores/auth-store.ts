import { create } from "zustand";
import { api, type ApiResponse, type AuthAwareRequestConfig } from "@/lib/api";
import type { UserRole } from "@/types";

interface AuthState {
  userId: number | null;
  userType: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<LoginOutcome>;
  verifyLoginOtp: (userId: number, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

interface LoginPayload {
  status_code: number;
  message: string | null;
  userID?: number;
  type?: UserRole;
  /** Platform operators finish signing in with an emailed code. */
  otpRequired?: boolean;
}

/** The subset of GET /me this store needs to identify the session. */
interface SessionUser {
  user: { id: number; userType: UserRole };
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

  /**
   * Restore the session on entering the app.
   *
   * The SESSION COOKIE is the source of truth, not localStorage. localStorage
   * is only a cache that lets a returning user render without waiting for a
   * round trip; when it is missing the server is asked who this is.
   *
   * Treating localStorage as the truth produced a hang with no error. The
   * middleware decides by cookie and sends anyone holding one from /login to
   * /dashboard; this gate decided by localStorage and sent anyone without it
   * from /dashboard to /login. A browser holding a valid cookie but no
   * localStorage therefore bounced between the two forever, rendering nothing.
   *
   * That is exactly the state Google sign-in leaves: the callback is a SERVER
   * redirect that sets cookies, so no client code ever ran to populate
   * localStorage. Clearing site data while staying signed in did it too.
   */
  initialize: async () => {
    if (typeof window === "undefined") return;

    const cachedId = localStorage.getItem("userId");
    const cachedType = localStorage.getItem("userType") as UserRole | null;
    if (cachedId && cachedType) {
      set({
        userId: Number(cachedId),
        userType: cachedType,
        isAuthenticated: true,
        isLoading: false,
      });
      return;
    }

    // No cache. Ask the server rather than assuming signed out: the cookie is
    // httpOnly, so this is the only way the client can see it.
    try {
      // skipAuthRedirect: a 401 here means "signed out", which is a valid
      // answer to the question being asked. Letting the interceptor treat it as
      // a lost session sends the browser to /login — and this probe runs ON
      // /login, so the page reloads and asks again, forever.
      const { data } = await api.get<ApiResponse<SessionUser>>("/me", {
        skipAuthRedirect: true,
      } as AuthAwareRequestConfig);
      const user = data?.data?.user;
      if (!user?.id || !user?.userType) {
        set({ isLoading: false });
        return;
      }
      localStorage.setItem("userId", String(user.id));
      localStorage.setItem("userType", user.userType);
      set({
        userId: user.id,
        userType: user.userType,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // 401, or the API is unreachable. Either way there is no usable session.
      set({ isLoading: false });
    }
  },
}));