import { SettingsForm } from "@/components/features/settings/SettingsForm";

export default function SettingsPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-harbor-navy">Settings</h1>
        <p className="text-sm text-muted">
          Update how your name appears across PortIQ.
        </p>
      </div>
      <SettingsForm />
    </div>
  );
}
