"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Mail, RotateCw, Send, UserMinus, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { api, type ApiResponse } from "@/lib/api";
import { describeError, type DescribedError } from "@/lib/errors";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Who is on a project, and who is being added to it.
 *
 * Every step here is the administrator's. A code is emailed to the person being
 * added, they read it back, and the administrator enters it and then records
 * the account — name, company, phone and first password. There is no page the
 * invitee visits and no link for them to follow.
 *
 * Kept out of the detail page because it is the one part of that screen that
 * WRITES: the detail page otherwise only renders what the project query
 * already returned.
 */

const MAX_LOGO_BYTES = 600 * 1024;
const ACCEPTED_LOGO = "image/png,image/jpeg,image/webp";
const MIN_PASSWORD = 8;

/** The details an administrator records for a brand-new account. */
const EMPTY_DETAILS = {
  firstName: "",
  lastName: "",
  companyName: "",
  companyLogo: "",
  phoneNo: "",
  password: "",
};

interface Invitation {
  id: number;
  role: "contractor" | "authority";
  emailId: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: number | null;
  isExpired: boolean;
  isLocked: boolean;
}

/**
 * How an invitation reads to an administrator.
 *
 * "pending" alone is not enough: a row that has expired, or that somebody has
 * been guessing the code on, still carries that status, and those are the two
 * cases where the administrator actually has something to do.
 */
function describe(
  invitation: Invitation,
  /** Who holds that role on the project right now, if anyone. */
  currentHolderId: number | null,
): { label: string; tone: StatusTone } {
  if (invitation.status === "accepted") {
    // The invitation was genuinely accepted and is never rewritten to say
    // otherwise. What CAN change is whether the person it let in is still on
    // the project, and saying only "Accepted" for someone who has since been
    // removed would read as though they still were.
    return invitation.acceptedBy === currentHolderId
      ? { label: "Accepted", tone: "green" }
      : { label: "Accepted · removed", tone: "slate" };
  }
  if (invitation.status === "revoked") return { label: "Revoked", tone: "slate" };
  if (invitation.isExpired) return { label: "Expired", tone: "red" };
  if (invitation.isLocked) return { label: "Locked", tone: "red" };
  return { label: "Awaiting reply", tone: "yellow" };
}

/** Who holds a slot right now, as the project query already reports them. */
export interface AssignedStakeholder {
  userId: number | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface StakeholdersPanelProps {
  projectId: number;
  contractor: AssignedStakeholder;
  authority: AssignedStakeholder;
}

function personName(s: AssignedStakeholder): string | null {
  if (!s.userId) return null;
  const name = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
  // A slot can be filled by someone whose name the list query did not return.
  // Saying "assigned" is still truer than rendering an empty row.
  return name || "Assigned";
}

export function StakeholdersPanel({
  projectId,
  contractor,
  authority,
}: StakeholdersPanelProps) {
  const { userType } = useAuthStore();
  const queryClient = useQueryClient();
  const canManage = userType === "superadmin" || userType === "admin";

  const [role, setRole] = useState<"contractor" | "authority">("contractor");
  const [emailId, setEmailId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<DescribedError | null>(null);

  /** The invitation currently being completed, and how far it has got. */
  const [activeId, setActiveId] = useState<number | null>(null);
  const [otp, setOtp] = useState("");
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [needsDetails, setNeedsDetails] = useState(false);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const closeFlow = () => {
    setActiveId(null);
    setOtp("");
    setDetails(EMPTY_DETAILS);
    setNeedsDetails(false);
    setLogoName(null);
    setLogoError(null);
  };

  const key = ["project", projectId, "invitations"];

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await api.get<ApiResponse & { data: Invitation[] }>(
        `/project/${projectId}/invitation`,
      );
      return data.data ?? [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse>(
        `/project/${projectId}/invitation`,
        { role, emailId },
      );
      return data;
    },
    onSuccess: (data) => {
      setEmailId("");
      setError(null);
      setMessage(data.message ?? "Code sent");
      // Open the flow straight on the invitation just created: the next thing
      // to happen is the administrator asking for the code.
      const created = (data as { data?: { invitationId?: number } }).data;
      if (created?.invitationId) {
        closeFlow();
        setActiveId(created.invitationId);
      }
      refresh();
    },
    onError: (err) => {
      setMessage(null);
      setError(describeError(err));
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ id, code }: { id: number; code: string }) => {
      const { data } = await api.post<
        ApiResponse & { data: { needsProfile: boolean } }
      >(`/project/${projectId}/invitation/${id}/verify`, { otp: code });
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      if (data.data?.needsProfile) {
        // A brand-new person: the administrator records who they are.
        setNeedsDetails(true);
        setMessage("Code verified. Now record their details.");
      } else {
        // Already has an account; verifying the code is the whole job.
        setNeedsDetails(false);
        completeMutation.mutate({ id: activeId!, body: {} });
      }
    },
    onError: (err) => setError(describeError(err)),
  });

  const completeMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: number;
      body: Record<string, unknown>;
    }) => {
      const { data } = await api.post<ApiResponse>(
        `/project/${projectId}/invitation/${id}/complete`,
        body,
      );
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      setMessage(data.message ?? "Account created");
      closeFlow();
      refresh();
      // The assignment lives on the project itself, which this panel receives
      // as props.
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => setError(describeError(err)),
  });

  const resendMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<ApiResponse>(
        `/project/${projectId}/invitation/${id}/resend`,
      );
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      setMessage(data.message ?? "Invitation resent");
      refresh();
    },
    onError: (err) => setError(describeError(err)),
  });

  const removeMutation = useMutation({
    mutationFn: async (role: "contractor" | "authority") => {
      const { data } = await api.delete<ApiResponse>(
        `/project/${projectId}/stakeholder/${role}`,
      );
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      setMessage(data.message ?? "Removed from the project");
      refresh();
      // The assignment lives on the project itself, which this panel receives
      // as props — so the project query has to be refetched too, or the row
      // would still show the person who was just removed.
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) =>
      setError(describeError(err)),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete<ApiResponse>(
        `/project/${projectId}/invitation/${id}`,
      );
      return data;
    },
    onSuccess: () => {
      setError(null);
      setMessage("Invitation revoked");
      refresh();
    },
    onError: (err) => setError(describeError(err)),
  });

  /**
   * Reads the chosen logo into a data URI.
   *
   * The checks here are a courtesy so the problem shows before a round trip;
   * the server repeats all of them and is the authority — it verifies the
   * actual magic bytes, which a browser's reported MIME type does not prove.
   */
  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_LOGO.split(",").includes(file.type)) {
      setLogoError("Use a PNG, JPG or WebP image");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(
        `That file is ${Math.round(file.size / 1024)} KB. The limit is ${MAX_LOGO_BYTES / 1024} KB.`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDetails((d) => ({ ...d, companyLogo: String(reader.result ?? "") }));
      setLogoName(file.name);
    };
    reader.onerror = () => setLogoError("That file could not be read");
    reader.readAsDataURL(file);
  };

  const invitations = query.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stakeholders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-slate-100 border-b border-slate-100">
          {(
            [
              { role: "contractor" as const, person: contractor },
              { role: "authority" as const, person: authority },
            ]
          ).map(({ role, person }) => {
            const name = personName(person);
            return (
              <li key={role} className="flex items-center gap-3 py-3">
                <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.78125rem] capitalize text-slate-500">
                    {role}
                  </p>
                  <p className="truncate text-sm text-slate-800">
                    {name ?? (
                      <span className="text-slate-400">Not assigned</span>
                    )}
                  </p>
                </div>
                {canManage && name && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(role)}
                  >
                    <UserMinus className="h-4 w-4 text-shm-red" />
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {canManage && (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              inviteMutation.mutate();
            }}
          >
            <Select
              label="Role"
              className="sm:w-44"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "contractor" | "authority")
              }
              options={[
                { value: "contractor", label: "Contractor" },
                { value: "authority", label: "Authority" },
              ]}
            />
            <Input
              label="Email address"
              type="email"
              placeholder="person@example.com"
              value={emailId}
              onChange={(e) => setEmailId(e.target.value)}
              required
            />
            <Button
              type="submit"
              disabled={!emailId || inviteMutation.isPending}
            >
              <Send className="h-4 w-4" />
              {inviteMutation.isPending ? "Sending…" : "Invite"}
            </Button>
          </form>
        )}

        {message && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[0.8125rem] text-slate-700">
            {message}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-shm-red/20 bg-shm-red/5 px-3 py-2 text-[0.8125rem] text-shm-red"
          >
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5 text-shm-red/85">{error.description}</p>
          </div>
        )}

        {invitations.length === 0 ? (
          <p className="py-2 text-[0.8125rem] text-slate-500">
            No one has been invited to this project yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invitations.map((invitation) => {
              const holderId =
                invitation.role === "contractor"
                  ? contractor.userId
                  : authority.userId;
              const meta = describe(invitation, holderId);
              const open =
                invitation.status === "pending" && !invitation.isExpired;
              return (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">
                      {invitation.emailId}
                    </p>
                    <p className="text-[0.78125rem] capitalize text-slate-500">
                      {invitation.role}
                      {invitation.isLocked && open
                        ? " · too many incorrect codes were entered"
                        : ""}
                    </p>
                  </div>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                  {canManage && invitation.status !== "accepted" && (
                    <div className="flex gap-1">
                      {open && !invitation.isLocked && (
                        <Button
                          size="sm"
                          variant={
                            activeId === invitation.id ? "secondary" : "outline"
                          }
                          onClick={() => {
                            if (activeId === invitation.id) {
                              closeFlow();
                            } else {
                              closeFlow();
                              setActiveId(invitation.id);
                            }
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                          {activeId === invitation.id ? "Close" : "Enter code"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Send a new code"
                        disabled={resendMutation.isPending}
                        onClick={() => resendMutation.mutate(invitation.id)}
                      >
                        <RotateCw className="h-4 w-4 text-slate-500" />
                      </Button>
                      {open && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Revoke invitation"
                          disabled={revokeMutation.isPending}
                          onClick={() => revokeMutation.mutate(invitation.id)}
                        >
                          <X className="h-4 w-4 text-shm-red" />
                        </Button>
                      )}
                    </div>
                  )}

                  {canManage && activeId === invitation.id && (
                    <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4">
                      {!needsDetails ? (
                        <form
                          className="flex flex-col gap-3 sm:flex-row sm:items-end"
                          onSubmit={(e) => {
                            e.preventDefault();
                            verifyMutation.mutate({
                              id: invitation.id,
                              code: otp,
                            });
                          }}
                        >
                          <Input
                            label="Verification code"
                            inputMode="numeric"
                            placeholder="6-digit code they received"
                            className="sm:w-64"
                            value={otp}
                            onChange={(e) =>
                              setOtp(
                                e.target.value.replace(/\D/g, "").slice(0, 6),
                              )
                            }
                          />
                          <Button
                            type="submit"
                            disabled={otp.length !== 6 || verifyMutation.isPending}
                          >
                            {verifyMutation.isPending
                              ? "Checking…"
                              : "Verify code"}
                          </Button>
                        </form>
                      ) : (
                        <form
                          className="space-y-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            completeMutation.mutate({
                              id: invitation.id,
                              body: {
                                ...details,
                                companyLogo: details.companyLogo || undefined,
                              },
                            });
                          }}
                        >
                          <p className="text-[0.8125rem] text-slate-600">
                            Recording the account for{" "}
                            <strong className="font-medium">
                              {invitation.emailId}
                            </strong>
                            . They will sign in with this email and the password
                            you set.
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              label="First name"
                              value={details.firstName}
                              onChange={(e) =>
                                setDetails({
                                  ...details,
                                  firstName: e.target.value,
                                })
                              }
                              required
                            />
                            <Input
                              label="Last name"
                              value={details.lastName}
                              onChange={(e) =>
                                setDetails({
                                  ...details,
                                  lastName: e.target.value,
                                })
                              }
                              required
                            />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              label="Company name"
                              value={details.companyName}
                              onChange={(e) =>
                                setDetails({
                                  ...details,
                                  companyName: e.target.value,
                                })
                              }
                            />
                            <Input
                              label="Phone number"
                              inputMode="tel"
                              value={details.phoneNo}
                              onChange={(e) =>
                                setDetails({
                                  ...details,
                                  phoneNo: e.target.value,
                                })
                              }
                              required
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">
                              Company logo
                            </label>
                            <input
                              type="file"
                              accept={ACCEPTED_LOGO}
                              onChange={onLogoChange}
                              className="block w-full text-[0.8125rem] text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-[0.8125rem] file:text-slate-700"
                            />
                            {logoName && !logoError && (
                              <p className="mt-1 text-[0.78125rem] text-slate-500">
                                {logoName}
                              </p>
                            )}
                            {logoError && (
                              <p className="mt-1 text-[0.78125rem] text-shm-red">
                                {logoError}
                              </p>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              type="password"
                              label="Password"
                              placeholder="At least 8 characters"
                              autoComplete="new-password"
                              value={details.password}
                              onChange={(e) =>
                                setDetails({
                                  ...details,
                                  password: e.target.value,
                                })
                              }
                              error={
                                details.password.length > 0 &&
                                details.password.length < MIN_PASSWORD
                                  ? `Use at least ${MIN_PASSWORD} characters`
                                  : undefined
                              }
                              required
                            />
                          </div>
                          <p className="text-[0.78125rem] text-slate-500">
                            Tell them this password. They can change it later
                            from their profile.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              disabled={
                                completeMutation.isPending ||
                                !details.firstName ||
                                !details.lastName ||
                                !details.phoneNo ||
                                details.password.length < MIN_PASSWORD
                              }
                            >
                              {completeMutation.isPending
                                ? "Creating…"
                                : "Create account"}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={closeFlow}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
