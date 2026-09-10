"use client";

import { useEffect, useState } from "react";
import { Menu, Bell, ChevronRight } from "lucide-react";
import { ImpersonationBanner } from "./impersonation-banner";
import { Avatar } from "@/components/ui/avatar";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Button } from "@/components/ui/button";
import { PulseDot } from "@/components/ui/pulse-dot";
import { useAuthStore } from "@/stores/auth-store";
import { useMe } from "@/hooks/use-me";
import { capitalize } from "@/lib/utils";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Operations",
  analytics: "Analysis",
  gateways: "Fleet",
  alerts: "Alerts",
  devices: "Devices",
  sensors: "Sensors",
  projects: "Workspace",
  reports: "Reports",
  exports: "Exports",
  "data-download": "Data Download",
  users: "Administration",
  mqtt: "MQTT Feed",
  audit: "Audit Log",
  subscription: "Billing",
  profile: "Settings",
};

function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toISOString().slice(11, 19) + "Z";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { userType: storedUserType, userId: storedUserId } = useAuthStore();
  const me = useMe();

  // Same reasoning as the sidebar: the identity chip must name whoever the API
  // is answering as, not whoever signed in. During a view-as session those are
  // different people, and a chip naming the operator over the viewed user's
  // data is a quiet invitation to misread it.
  const userType = me.data?.user.userType ?? storedUserType;
  const userId = me.data?.user.id ?? storedUserId;
  const pathname = usePathname();
  const utc = useUtcClock();

  const segment = pathname.split("/").filter(Boolean)[0] || "dashboard";
  const moduleLabel = ROUTE_LABELS[segment] ?? "Console";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleMenu() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpen((open) => !open);
    } else {
      setCollapsed((c) => !c);
    }
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-shm-navy-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-sm lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMenu}
              aria-label="Toggle navigation"
              className="shrink-0 text-slate-500"
            >
              <Menu className="h-5 w-5" />
            </Button>
            {/* breadcrumb */}
            <div className="hidden min-w-0 items-center gap-1.5 font-mono text-[11px] sm:flex">
              <span className="font-semibold uppercase tracking-[0.18em] text-shm-navy-600">
                SHM
              </span>
              <ChevronRight className="h-3 w-3 text-slate-300" />
              <span className="truncate uppercase tracking-[0.18em] text-slate-400">
                {moduleLabel}
              </span>
            </div>
            <PulseDot tone="green" className="sm:hidden" />
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {/* live clock */}
            <div className="hidden items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-500 md:flex">
              <PulseDot tone="green" />
              <span className="tabular-nums tracking-wide">{utc}</span>
            </div>

            <Button variant="ghost" size="icon" className="relative text-slate-500" aria-label="Notifications">
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
              <span className="absolute right-2 top-2 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-shm-red opacity-60" style={{ animationDuration: "2.4s" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-shm-red" />
              </span>
            </Button>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white pl-1 pr-2.5 py-1">
              <Avatar
                src={me.data?.tenant?.logoUrl}
                name={me.data?.tenant?.name}
                fallback={userType}
                size="sm"
              />
              <div className="hidden leading-tight sm:block">
                <p className="text-xs font-medium text-slate-800 capitalize">{capitalize(userType)}</p>
                <p className="font-mono text-[9.5px] text-slate-400">ID: {userId}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Directly under the header and above the scroll region, so it stays
            visible on every page rather than scrolling away with the content. */}
        <ImpersonationBanner />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">{children}</main>
      </div>
    </div>
  );
}