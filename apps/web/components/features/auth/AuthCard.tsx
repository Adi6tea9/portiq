import Link from "next/link";
import { Ship } from "lucide-react";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-harbor-navy">{title}</h1>
        {description ? (
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      <div className="mt-6">{children}</div>
      {footer ? (
        <div className="mt-6 border-t border-border pt-4 text-sm text-muted">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function AuthBrand() {
  return (
    <Link
      href="/"
      aria-label="PortIQ home"
      className="inline-flex items-center gap-2 text-harbor-navy"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ocean-teal text-white">
        <Ship aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight">PortIQ</span>
    </Link>
  );
}
