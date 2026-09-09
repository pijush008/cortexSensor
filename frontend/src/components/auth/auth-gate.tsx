"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

const PUBLIC_PATHS = ["/login"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !PUBLIC_PATHS.includes(pathname)) {
      router.replace("/login");
    }
    if (isAuthenticated && PUBLIC_PATHS.includes(pathname)) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-shm-navy-800 text-lg font-bold text-white">
            SH
          </div>
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !PUBLIC_PATHS.includes(pathname)) {
    return null;
  }

  return <>{children}</>;
}