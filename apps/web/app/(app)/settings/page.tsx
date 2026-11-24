import { Settings } from "lucide-react";
import { SettingsForm } from "@/components/features/settings/SettingsForm";
import { PageHeader } from "@/components/shell/PageHeader";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="Settings"
        description="Update how your name appears across PortIQ."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)] xl:items-start">
        <div className="min-w-0 max-w-2xl">
          <SettingsForm />
        </div>
        <div className="app-note-callout rounded-2xl p-4 text-sm">
          <p className="font-semibold text-harbor-navy">Your default port</p>
          <p className="mt-1">
            Pick an <strong>Active port</strong> in the sidebar to make it the starting port on
            Capacity and on new shipments. It is saved in this browser.
          </p>
        </div>
      </div>
    </div>
  );
}
