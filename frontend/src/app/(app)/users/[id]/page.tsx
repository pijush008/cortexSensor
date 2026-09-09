"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  ArrowLeft,
  Building2,
  Eye,
  KeyRound,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { QueryState } from "@/components/ui/query-state";
import { useMe } from "@/hooks/use-me";
import {
  usePlatformUser,
  useStartImpersonation,
  type SessionState,
} from "@/hooks/use-platform-user";
import { describeError } from "@/lib/errors";

/**
 * One user, as a platform operator sees them.
 *
 * Three questions, in the order an operator actually asks them: who is this and
 * what may they do, are they getting in, and what have they done. Each section
 * is backed by stored rows — memberships, refresh tokens, audit entries.
 *
 * There is deliberately no "currently viewing" or "last seen on page" panel.
 * The platform records writes and session issuance, not reads or navigation, so
 * any such display would be invented activity about a real person.
 */

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const SESSION_TONE: Record<SessionState, "green" | "slate" | "yellow" | "red"> = {
  active: "green",
  rotated: "slate",
  expired: "slate",
  revoked: "red",
};

const SESSION_EXPLAINER: Record<SessionState, string> = {
  active: "Signed in and still valid",
  rotated: "Refreshed into a newer session",
  expired: "Lapsed without being refreshed",
  revoked: "Ended by sign-out or revocation",
};

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();

  const userId = Number(params?.id);
  const detail = usePlatformUser(Number.isInteger(userId) ? userId : null);
  const startImpersonation = useStartImpersonation();

  const data = detail.data;

  const activeSessions = useMemo(
    () => data?.sessions.filter((s) => s.state === "active").length ?? 0,
    [data],
  );

  // Mirrors the server's own refusals, so the button is not offered where the
  // API would reject it. The API is still the enforcement point.
  const canViewAs =
    Boolean(me.data?.isPlatformAdmin) &&
    Boolean(data) &&
    !data!.user.isPlatformAdmin &&
    data!.user.isActive &&
    data!.user.id !== me.data?.user.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/users")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to users
        </Button>
      </div>

      <QueryState
        query={detail}
        skeleton={
          <div className="space-y-5">
            <Card className="h-40 animate-pulse bg-slate-100" />
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="h-48 animate-pulse bg-slate-100" />
              <Card className="h-48 animate-pulse bg-slate-100" />
            </div>
          </div>
        }
      >
        {(data) => (
          <>
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">
                    {data.user.firstName} {data.user.lastName}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-600">{data.user.emailId}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{data.user.phoneNo}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={data.user.isActive ? "Active" : "Disabled"}
                    tone={data.user.isActive ? "green" : "red"}
                  />
                  <StatusBadge
                    label={data.user.isUserVerified ? "Verified" : "Unverified"}
                    tone={data.user.isUserVerified ? "green" : "yellow"}
                  />
                  <StatusBadge
                    label={data.user.mfaEnabled ? "MFA on" : "MFA off"}
                    tone={data.user.mfaEnabled ? "green" : "slate"}
                  />
                  {data.user.isPlatformAdmin && (
                    <StatusBadge label="Platform operator" tone="slate" />
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <Button
                  onClick={() => startImpersonation.mutate(data.user.id)}
                  disabled={!canViewAs || startImpersonation.isPending}
                >
                  <Eye className="mr-1.5 h-4 w-4" />
                  {startImpersonation.isPending ? "Opening…" : "View as this user"}
                </Button>
                <p className="text-[13px] text-slate-500">
                  {data.user.isPlatformAdmin
                    ? "A platform operator cannot be viewed as."
                    : !data.user.isActive
                      ? "This account is disabled."
                      : "Opens a read-only session for 15 minutes. Both ends are recorded in the audit log."}
                </p>
              </div>

              {startImpersonation.isError && (
                <p className="mt-2 text-[13px] text-shm-red">
                  {describeError(startImpersonation.error).description}
                </p>
              )}
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  Organizations
                </h2>

                {data.memberships.length === 0 ? (
                  <p className="mt-3 text-[13px] text-slate-500">
                    {data.user.isPlatformAdmin
                      ? "A platform operator administers the product itself and belongs to no organization."
                      : "This user is not a member of any organization."}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {data.memberships.map((m) => (
                      <li
                        key={m.tenantId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <div>
                          <p className="text-[13px] font-medium text-slate-800">
                            {m.tenantName}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {m.role ?? "no role"}
                          </p>
                        </div>
                        <StatusBadge
                          label={m.membershipStatus}
                          tone={m.membershipStatus === "active" ? "green" : "slate"}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-slate-400" />
                  Permissions
                  <span className="ml-auto text-[11px] font-normal text-slate-500">
                    {data.permissions.length}
                  </span>
                </h2>

                {data.permissions.length === 0 ? (
                  <p className="mt-3 text-[13px] text-slate-500">
                    {data.user.isPlatformAdmin
                      ? "Platform authority is not expressed as granular permissions — an operator is authorized by the platform-operator flag itself."
                      : "No permissions: this user holds no active membership."}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {data.permissions.map((p) => (
                      <span
                        key={p}
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Monitor className="h-4 w-4 text-slate-400" />
                Sign-in sessions
                <span className="ml-auto text-[11px] font-normal text-slate-500">
                  {activeSessions} active
                </span>
              </h2>

              {data.sessions.length === 0 ? (
                <p className="mt-3 text-[13px] text-slate-500">
                  This user has never signed in.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        <th className="pb-2 pr-4 font-medium">Signed in</th>
                        <th className="pb-2 pr-4 font-medium">Expires</th>
                        <th className="pb-2 font-medium">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sessions.map((s) => (
                        <tr key={s.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-4 text-slate-700">
                            {formatDateTime(s.createdAt)}
                          </td>
                          <td className="py-2 pr-4 text-slate-500">
                            {formatDateTime(s.expiresAt)}
                          </td>
                          <td className="py-2">
                            <span title={SESSION_EXPLAINER[s.state]}>
                              <StatusBadge label={s.state} tone={SESSION_TONE[s.state]} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <KeyRound className="h-4 w-4 text-slate-400" />
                Activity
                <span className="ml-auto text-[11px] font-normal text-slate-500">
                  {data.activity.total} recorded
                </span>
              </h2>

              <p className="mt-1 text-[12px] text-slate-500">
                Changes this user made. Reads and page views are not recorded, so
                this is what they did — not what they looked at.
              </p>

              {data.activity.items.length === 0 ? (
                <p className="mt-3 text-[13px] text-slate-500">
                  Nothing recorded for this user yet.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        <th className="pb-2 pr-4 font-medium">When</th>
                        <th className="pb-2 pr-4 font-medium">Action</th>
                        <th className="pb-2 pr-4 font-medium">Entity</th>
                        <th className="pb-2 font-medium">From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.activity.items.map((a) => (
                        <tr key={a.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-4 text-slate-700">
                            {formatDateTime(a.createdAt)}
                          </td>
                          <td className="py-2 pr-4 font-mono text-[12px] text-slate-600">
                            {a.action}
                          </td>
                          <td className="py-2 pr-4 text-slate-600">
                            {a.entity}
                            {a.entityId !== null && (
                              <span className="text-slate-400"> #{a.entityId}</span>
                            )}
                          </td>
                          <td className="py-2 font-mono text-[12px] text-slate-500">
                            {a.ipAddress ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}
