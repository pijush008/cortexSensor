"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  ProjectorIcon as Projector,
  Cpu,
  Gauge,
  FileDown,
  BarChart3,
  Users,
  LogOut,
  Settings,
  Activity,
  Server,
  Bell,
  LineChart,
  ShieldCheck,
  CreditCard,
  DownloadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useMe } from "@/hooks/use-me";
import type { UserRole } from "@/types";

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface MenuItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const MENU_SECTION: Record<UserRole, { label: string; items: MenuItem[] }[]> = {
  superadmin: [
    {
      label: "Operations",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/analytics", label: "Analysis", icon: LineChart },
        { href: "/alerts", label: "Alerts", icon: Bell },
      ],
    },
    {
      label: "Fleet",
      items: [
        { href: "/gateways", label: "Gateways", icon: Server },
        { href: "/devices", label: "Devices", icon: Cpu },
        { href: "/sensors", label: "Sensors", icon: Gauge },
        { href: "/mqtt", label: "MQTT Feed", icon: Activity },
      ],
    },
    {
      label: "Workspace",
      items: [
        { href: "/projects", label: "Projects", icon: Projector },
        { href: "/structures", label: "Structures", icon: Building2 },
        { href: "/reports", label: "Reports", icon: BarChart3 },
        { href: "/exports", label: "Exports", icon: FileDown },
        { href: "/data-download", label: "Data Download", icon: DownloadCloud },
      ],
    },
    {
      label: "Administration",
      items: [
        { href: "/users", label: "Users", icon: Users },
        { href: "/audit", label: "Audit Log", icon: ShieldCheck },
        { href: "/subscription", label: "Subscription", icon: CreditCard },
      ],
    },
  ],
  admin: [
    {
      label: "Operations",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/analytics", label: "Analysis", icon: LineChart },
        { href: "/alerts", label: "Alerts", icon: Bell },
      ],
    },
    {
      label: "Fleet",
      items: [
        { href: "/gateways", label: "Gateways", icon: Server },
        { href: "/devices", label: "Devices", icon: Cpu },
        { href: "/sensors", label: "Sensors", icon: Gauge },
        { href: "/mqtt", label: "MQTT Feed", icon: Activity },
      ],
    },
    {
      label: "Workspace",
      items: [
        { href: "/projects", label: "Projects", icon: Projector },
        { href: "/structures", label: "Structures", icon: Building2 },
        { href: "/reports", label: "Reports", icon: BarChart3 },
        { href: "/data-download", label: "Data Download", icon: DownloadCloud },
      ],
    },
    {
      label: "Administration",
      items: [
        { href: "/users", label: "Users", icon: Users },
        // An ORGANIZATION_ADMIN holds AUDIT_VIEW, so the entry belongs here.
        // It was previously superadmin-only, which contradicted the grant.
        { href: "/audit", label: "Audit Log", icon: ShieldCheck },
        { href: "/subscription", label: "Subscription", icon: CreditCard },
      ],
    },
  ],
  contractor: [
    {
      label: "Operations",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/alerts", label: "Alerts", icon: Bell },
      ],
    },
    {
      label: "Fleet",
      items: [
        { href: "/gateways", label: "Gateways", icon: Server },
        { href: "/mqtt", label: "MQTT Feed", icon: Activity },
      ],
    },
    {
      label: "Workspace",
      items: [
        { href: "/projects", label: "Projects", icon: Projector },
        { href: "/structures", label: "Structures", icon: Building2 },
        { href: "/reports", label: "Reports", icon: BarChart3 },
      ],
    },
  ],
  authority: [
    {
      label: "Operations",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/alerts", label: "Alerts", icon: Bell },
      ],
    },
    {
      label: "Workspace",
      items: [
        { href: "/reports", label: "Reports", icon: BarChart3 },
      ],
    },
  ],
};

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { userType, logout } = useAuthStore();
  const me = useMe();
  // Safe fallback: never over-privilege. An authenticated session always has a
  // userType, so this only triggers on an inconsistent/legacy client state.
  //
  // The SERVER's answer wins when it differs. localStorage holds whoever last
  // signed in, which during a view-as session is the platform operator — so
  // navigating by it would show an operator's menu on top of a technician's
  // data, which is precisely the confusion the feature exists to avoid.
  const role = ((me.data?.user.userType as UserRole) ||
    (userType as UserRole) ||
    "authority") as UserRole;
  const sections = MENU_SECTION[role] || MENU_SECTION.authority;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-shm-navy-700/60 bg-shm-navy-900 transition-[width,transform] duration-300 lg:static lg:w-64 lg:translate-x-0",
        collapsed && "lg:w-[68px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "lg:justify-center lg:px-0")}>
        {collapsed ? (
          <div className="hidden h-9 w-9 items-center justify-center rounded-lg bg-shm-navy-500 font-bold text-white lg:flex">
            SH
          </div>
        ) : (
          <>
            {/* A small, fixed-size local asset: next/image would add a loader
                and layout machinery for no benefit at this size.
                max-w and shrink-0 are load-bearing — the supplied logo is a
                wide lockup, and at `w-auto` it grew past its share of the
                sidebar and rendered underneath the wordmark. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/company-logo.jpeg"
              alt=""
              className="h-8 w-auto max-w-[96px] shrink-0 object-contain"
            />
            <div className="min-w-0 leading-none">
              <p className="truncate text-[13px] font-semibold tracking-tight text-white">
                SHM Console
              </p>
              <p className="mt-1 truncate font-mono text-[9.5px] uppercase tracking-[0.24em] text-shm-navy-300">
                Structural Monitor
              </p>
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {sections.map((section) => (
          <div key={section.label} className="space-y-0.5">
            {!collapsed && (
              <p className="px-3 pb-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.24em] text-shm-navy-400">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-200",
                    isActive
                      ? "bg-white/[0.07] text-white"
                      : "text-shm-navy-200 hover:bg-white/[0.05] hover:text-white",
                    collapsed && "lg:justify-center lg:px-0"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {/* active indicator */}
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-shm-navy-300 transition-opacity duration-300",
                      isActive ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110",
                      isActive ? "text-white" : "text-shm-navy-300 group-hover:text-shm-navy-200"
                    )}
                    strokeWidth={1.75}
                  />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-white/10 bg-white/[0.03] p-3">
        <Link
          href="/profile"
          onClick={onCloseMobile}
          className={cn(
            "group flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-shm-navy-200 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white",
            collapsed && "lg:justify-center lg:px-0"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="h-[18px] w-[18px] shrink-0 text-shm-navy-300 transition-transform duration-200 group-hover:rotate-45" strokeWidth={1.75} />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={logout}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-red-300/90 transition-colors duration-200 hover:bg-shm-red/15 hover:text-red-200 cursor-pointer",
            collapsed && "lg:justify-center lg:px-0"
          )}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.75} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}