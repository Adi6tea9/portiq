import { AppGuard } from "@/components/features/auth/AppGuard";
import { AppProviders } from "@/components/providers/AppProviders";
import { AppShell } from "@/components/shell/AppShell";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppProviders initialRole="importer_exporter">
      <AppShell>
        <AppGuard>{children}</AppGuard>
      </AppShell>
    </AppProviders>
  );
}
