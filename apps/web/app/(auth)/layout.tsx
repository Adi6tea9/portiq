import { AuthBrand } from "@/components/features/auth/AuthCard";
import { MockProvider } from "@/components/providers/MockProvider";
import { isMockMode } from "@/lib/auth/mock";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <MockProvider enabled={isMockMode()}>
      <div className="flex min-h-screen flex-col bg-canvas">
        <header className="flex h-16 items-center px-4 sm:px-8">
          <AuthBrand />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </MockProvider>
  );
}
