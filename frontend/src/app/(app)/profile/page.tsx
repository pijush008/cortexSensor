"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Save, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { PageHeader } from "@/components/layout/page-header";
import { api, type ApiResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useMe } from "@/hooks/use-me";
import { Avatar } from "@/components/ui/avatar";
import { describeError } from "@/lib/errors";

const MAX_LOGO_BYTES = 600 * 1024;
const ACCEPTED_LOGO = "image/png,image/jpeg,image/webp";

const EMPTY_PROFILE = {
  firstName: "",
  lastName: "",
  phoneNo: "",
  companyName: "",
};

export default function ProfilePage() {
  const { userId, userType } = useAuthStore();
  const me = useMe();
  const queryClient = useQueryClient();

  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState<string | null>(null);

  // Seeded from the server once it answers, and re-seeded if it answers again
  // with different values — a useState initialiser alone would capture the
  // empty form rendered before the query resolved.
  useEffect(() => {
    const u = me.data?.user;
    if (!u) return;
    setProfile({
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      phoneNo: u.phoneNo ?? "",
      companyName: u.companyName ?? "",
    });
  }, [me.data?.user]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch<ApiResponse>("/me", {
        ...profile,
        ...(logo ? { companyLogo: logo } : {}),
      });
      return data;
    },
    onSuccess: () => {
      setProfileError(null);
      setProfileSaved("Profile updated.");
      setLogo(null);
      setLogoName(null);
      // The name and logo appear in the sidebar and on projects, so the
      // session's own record of itself has to be refetched, not just this form.
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      setProfileSaved(null);
      setProfileError(describeError(err).description);
    },
  });

  /**
   * Reads the chosen logo into a data URI.
   *
   * These checks are a courtesy so the problem shows before a round trip; the
   * server repeats them and is the authority — it verifies the actual magic
   * bytes, which a browser's reported MIME type does not prove.
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
      setLogo(String(reader.result ?? ""));
      setLogoName(file.name);
    };
    reader.onerror = () => setLogoError("That file could not be read");
    reader.readAsDataURL(file);
  };

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const changePw = useMutation({
    mutationFn: async () => {
      // No userId: the server takes the target from the session. Sending one
      // would be ignored, and naming another account is exactly what the
      // endpoint no longer permits.
      const { data } = await api.post<ApiResponse>("/changePassword", {
        newPassword,
        oldPassword: oldPassword || undefined,
      });
      return data;
    },
    onSuccess: () => {
      setSuccess("Password updated successfully.");
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
      setError(null);
    },
    onError: (err) =>
      setError((err as Error).message || "Failed to change password"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    changePw.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        subtitle="Manage your account settings."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Reveal>
          <Card>
            <CardHeader>
              <SectionLabel label="Identity" className="mb-2" />
              <div className="flex items-center gap-2">
                <UserCircle2 className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
                <CardTitle>Account</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-6 flex items-center gap-4">
                <Avatar
                  src={
                    me.data?.user.companyLogoUrl ?? me.data?.tenant?.logoUrl
                  }
                  name={
                    me.data?.user.companyName ??
                    `${me.data?.user.firstName ?? ""} ${me.data?.user.lastName ?? ""}`.trim()
                  }
                  fallback={userType}
                  size="lg"
                />
                <div className="min-w-0">
                  {/* The person's name, not their row id. This read
                      "User #<id>" while /me had been returning a real name all
                      along. */}
                  <p className="truncate font-semibold text-slate-900">
                    {`${me.data?.user.firstName ?? ""} ${me.data?.user.lastName ?? ""}`.trim() ||
                      `User #${userId}`}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {me.data?.user.email}
                  </p>
                  <p className="text-sm text-slate-500">Role: {userType}</p>
                  {me.data?.tenant?.name && (
                    <p className="truncate text-sm text-slate-500">
                      {me.data.tenant.name}
                    </p>
                  )}
                </div>
              </div>

              {profileError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {profileError}
                </div>
              )}
              {profileSaved && (
                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  {profileSaved}
                </div>
              )}

              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setProfileSaved(null);
                  setProfileError(null);
                  saveProfile.mutate();
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="First name"
                    value={profile.firstName}
                    onChange={(e) =>
                      setProfile({ ...profile, firstName: e.target.value })
                    }
                    required
                  />
                  <Input
                    label="Last name"
                    value={profile.lastName}
                    onChange={(e) =>
                      setProfile({ ...profile, lastName: e.target.value })
                    }
                    required
                  />
                </div>
                <Input
                  label="Phone number"
                  inputMode="tel"
                  value={profile.phoneNo}
                  onChange={(e) =>
                    setProfile({ ...profile, phoneNo: e.target.value })
                  }
                />
                <Input
                  label="Company name"
                  value={profile.companyName}
                  onChange={(e) =>
                    setProfile({ ...profile, companyName: e.target.value })
                  }
                />
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
                      {logoName} — save to apply
                    </p>
                  )}
                  {logoError && (
                    <p className="mt-1 text-[0.78125rem] text-shm-red">
                      {logoError}
                    </p>
                  )}
                </div>
                <Button type="submit" disabled={saveProfile.isPending}>
                  <Save className="h-4 w-4" />
                  {saveProfile.isPending ? "Saving…" : "Save changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={80} className="lg:col-span-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <SectionLabel label="Security" className="mb-2" />
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
                <CardTitle>Change Password</CardTitle>
              </div>
            </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                {success}
              </div>
            )}
            <form className="max-w-md space-y-4" onSubmit={submit}>
              <Input
                type="password"
                label="Current Password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
              />
              <Input
                type="password"
                label="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <Input
                type="password"
                label="Confirm New Password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
              />
              <Button type="submit" disabled={changePw.isPending}>
                {changePw.isPending ? "Updating…" : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
        </Reveal>
      </div>
    </div>
  );
}