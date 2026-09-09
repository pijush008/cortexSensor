import { AuthGate } from "@/components/auth/auth-gate";
import { RoleGuard } from "@/components/auth/role-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <RoleGuard>
        <AppShell>{children}</AppShell>
      </RoleGuard>
    </AuthGate>
  );
}