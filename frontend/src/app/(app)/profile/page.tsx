"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, UserCircle2 } from "lucide-react";
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

export default function ProfilePage() {
  const { userId, userType } = useAuthStore();
  const me = useMe();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const changePw = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse>("/changePassword", {
        userId: String(userId),
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
              <SectionLabel index="26" label="Identity" className="mb-2" />
              <div className="flex items-center gap-2">
                <UserCircle2 className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
                <CardTitle>Account</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-6 flex items-center gap-4">
                <Avatar
                  src={me.data?.tenant?.logoUrl}
                  name={me.data?.tenant?.name}
                  fallback={userType}
                  size="lg"
                />
                <div>
                  <p className="font-semibold text-slate-900">User #{userId}</p>
                  <p className="text-sm text-slate-500">Role: {userType}</p>
                  {me.data?.tenant?.name && (
                    <p className="text-sm text-slate-500">{me.data.tenant.name}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={80} className="lg:col-span-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <SectionLabel index="27" label="Security" className="mb-2" />
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