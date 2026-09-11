"use client";

import { useState } from "react";
import { useParamFilter } from "@/hooks/use-param-filter";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { api, type ApiResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { capitalize } from "@/lib/utils";
import type { User, UserRole } from "@/types";

interface UserListResponse extends ApiResponse {
  data: { currentData: User[]; totalItems: number };
}

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  emailId: "",
  phoneNo: "",
  password: "",
};

type Tab = UserRole;

/** Registries reachable via ?tab, validated so a bad value falls back. */
const USER_TABS = ["admin", "contractor", "authority"] as const satisfies readonly Tab[];

export default function UsersPage() {
  const { userType, userId } = useAuthStore();
  const router = useRouter();
  const isSuperAdmin = userType === "superadmin";
  const queryClient = useQueryClient();
  // Seeded from ?tab so the dashboard's Admins/Contractors/Authorities tiles
  // land on the matching registry rather than always on Admins.
  const [tab, setTab] = useParamFilter<Tab>("tab", USER_TABS, "admin");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const userTypeShown: UserRole = isSuperAdmin ? tab : "contractor";
  const listAdminId = isSuperAdmin ? "0" : String(userId ?? 0);

  const listQuery = useQuery({
    queryKey: ["users", userTypeShown, listAdminId, search],
    queryFn: async () => {
      try {
        const { data } = await api.get<UserListResponse>(
          `/user/list/${userTypeShown}/${listAdminId}`,
          { params: { searchTerm: search || undefined } },
        );
        return (data.data?.currentData as User[]) || [];
      } catch {
        return [];
      }
    },
    enabled: !!userTypeShown,
  });

  const users = listQuery.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["users"] });

  const addUser = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse>(
        `/register/${userTypeShown}`,
        { ...form, admin_id: isSuperAdmin ? null : String(userId) },
      );
      return data;
    },
    onSuccess: () => {
      invalidate();
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) =>
      setError((err as Error).message || "Failed to add user"),
  });

  const verifyUser = useMutation({
    mutationFn: async ({ id, verify }: { id: number; verify: boolean }) => {
      const { data } = await api.get<ApiResponse>(
        `/verify/user/${id}/${verify ? "verify" : "unverify"}`,
      );
      return data;
    },
    onSuccess: () => invalidate(),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.get<ApiResponse>(`/delete/admin/${id}`);
      return data;
    },
    onSuccess: () => invalidate(),
  });

  const tabs: { key: Tab; label: string }[] = isSuperAdmin
    ? [
        { key: "admin", label: "Admins" },
        { key: "contractor", label: "Contractors" },
        { key: "authority", label: "Authorities" },
      ]
    : [{ key: "contractor", label: "Contractors" }];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage platform users and their verification status."
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowModal(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add {capitalize(userTypeShown)}
          </Button>
        }
      />

      <div className="flex rounded-lg border border-slate-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              tab === t.key
                ? "bg-shm-navy-800 text-white"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Reveal>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>{capitalize(userTypeShown)} List</CardTitle>
              </div>
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:w-64"
              />
            </div>
          </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <LoadingState />
          ) : users.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={`No ${capitalize(userTypeShown)} users found`}
              description="Users in this role will appear here once added."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[0.75rem] font-medium text-slate-500">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Email</th>
                    <th className="pb-3 pr-4 font-medium">Phone</th>
                    <th className="pb-3 pr-4 font-medium">Verification</th>
                    {isSuperAdmin && <th className="pb-3 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className={cn(
                        "border-b border-slate-100 last:border-0 hover:bg-slate-50",
                        // Only a platform operator has a detail page to open;
                        // for anyone else the row stays inert rather than
                        // offering a link that would come back 403.
                        isSuperAdmin && "cursor-pointer",
                      )}
                      onClick={
                        isSuperAdmin ? () => router.push(`/users/${u.id}`) : undefined
                      }
                    >
                      <td className="py-3 pr-4 font-medium text-slate-800">
                        {u.firstName} {u.lastName}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{u.emailId}</td>
                      <td className="py-3 pr-4 text-slate-600">{u.phoneNo}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge
                          label={
                            u.isUserVerified === "true_" ? "Verified" : "Unverified"
                          }
                          tone={u.isUserVerified === "true_" ? "green" : "yellow"}
                        />
                      </td>
                      {isSuperAdmin && (
                        <td className="py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                verifyUser.mutate({
                                  id: u.id,
                                  verify: u.isUserVerified !== "true_",
                                })
                              }
                              aria-label="Toggle verification"
                            >
                              {u.isUserVerified === "true_" ? (
                                <ShieldOff className="h-4 w-4 text-amber-600" />
                              ) : (
                                <ShieldCheck className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteUser.mutate(u.id)}
                              aria-label="Delete user"
                            >
                              <Trash2 className="h-4 w-4 text-shm-red" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </Reveal>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={`Add ${capitalize(userTypeShown)}`}
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            addUser.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
            />
            <Input
              label="Last Name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={form.emailId}
            onChange={(e) => setForm({ ...form, emailId: e.target.value })}
            required
          />
          <Input
            label="Phone"
            value={form.phoneNo}
            onChange={(e) => setForm({ ...form, phoneNo: e.target.value })}
            required
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addUser.isPending}>
              {addUser.isPending ? "Adding…" : "Add User"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}