import { AuthBrand } from "@/components/features/auth/AuthCard";
import { MockProvider } from "@/components/providers/MockProvider";
import { isMockMode } from "@/lib/auth/mock";
import { portiqThemeContent } from "@/themes/portiq/content";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <MockProvider enabled={isMockMode()}>
      <div className="app-auth flex min-h-screen flex-col bg-canvas">
        {/* PortIQ theme only: brand panel beside the form on wide screens. */}
        <aside className="app-auth-aside">
          <AuthBrand />
          <p className="app-auth-tagline">{portiqThemeContent.tagline}</p>
          <div className="mt-16 max-w-md space-y-6">
            <p className="app-display text-6xl font-semibold leading-[1.05]">
              {portiqThemeContent.authHeading}
            </p>
            <p className="max-w-sm text-lg leading-relaxed text-white/85">
              {portiqThemeContent.authBody}
            </p>
            <span aria-hidden="true" className="app-auth-accent block" />
          </div>
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="app-auth-header flex h-16 items-center px-4 sm:px-8">
            <AuthBrand />
          </header>
          <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
            <div className="w-full max-w-md">{children}</div>
          </main>
        </div>
      </div>
    </MockProvider>
  );
}
