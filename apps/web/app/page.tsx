import type { Metadata } from "next";
import Link from "next/link";
import { Database, Scale, Unplug } from "lucide-react";
import { AuthBrand } from "@/components/features/auth/AuthCard";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { Button } from "@/components/ui/button";
import { isMockMode } from "@/lib/auth/mock";

export const metadata: Metadata = {
  title: "PortIQ - Predict. Plan. Ship.",
  description:
    "Estimated container dwell time, an indicative cost breakdown and a port capacity forecast before cargo moves.",
};

/**
 * F10 names the three steps but does not define their copy. The wording is
 * derived from the flows F03 (create shipment), F05 (run prediction) and F06
 * (capacity forecast).
 */
// CONTRACT-GAP: GAP-034
function howItWorksSteps() {
  return [
    {
      title: "Create a shipment",
      body: "Enter the port, cargo, container, expected arrival and documentation status.",
    },
    {
      title: "Run a prediction",
      body: "Get an estimated dwell time, an indicative cost breakdown and the model effects behind the estimate.",
    },
    {
      title: "Plan with the forecast",
      body: "Review the capacity forecast for the arrival window before the shipment moves.",
    },
  ];
}

const LIMITATIONS = [
  {
    icon: Unplug,
    title: "No terminal integration",
    body: "PortIQ does not connect to terminal or port operating systems. Arrival and documentation details are entered by your team.",
  },
  {
    icon: Scale,
    title: "Estimates, not guarantees",
    body: "Dwell time and costs are model estimates. Verify them against applicable tariffs and carrier terms.",
  },
  {
    icon: Database,
    title: "Synthetic demo data",
    body: "This prototype runs on synthetic demo data, including its capacity forecasts and tariff rules.",
  },
];

function RouteMotif() {
  return (
    <div
      aria-hidden="true"
      className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6"
    >
      <svg viewBox="0 0 480 300" fill="none" className="h-auto w-full">
        <rect
          x="0.5"
          y="0.5"
          width="479"
          height="299"
          rx="11"
          className="fill-canvas stroke-border"
        />
        <path
          d="M70 232C150 232 150 96 240 96s100 72 170 72"
          className="stroke-ocean-teal"
          strokeWidth="2"
          strokeDasharray="7 7"
          strokeLinecap="round"
        />
        <circle
          cx="70"
          cy="232"
          r="9"
          className="fill-surface stroke-harbor-navy"
          strokeWidth="3"
        />
        <circle
          cx="410"
          cy="168"
          r="9"
          className="fill-surface stroke-harbor-navy"
          strokeWidth="3"
        />
        <g transform="translate(214 62)">
          <rect
            width="52"
            height="34"
            rx="4"
            className="fill-surface stroke-harbor-navy"
            strokeWidth="2"
          />
          <path
            d="M13 0v34M26 0v34M39 0v34"
            className="stroke-border"
            strokeWidth="1.5"
          />
        </g>
      </svg>
    </div>
  );
}

export default function Home() {
  const steps = howItWorksSteps();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-harbor-navy focus:shadow"
      >
        Skip to content
      </a>

      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-4 px-4 sm:px-8">
          <AuthBrand />
          <nav aria-label="Account" className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Create account</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section
          aria-labelledby="hero-title"
          className="border-b border-border"
        >
          <div className="mx-auto grid max-w-content items-center gap-12 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-harbor-navy">
                Shipment planning and port capacity forecasting
              </p>
              <h1
                id="hero-title"
                className="mt-4 text-balance text-4xl font-semibold tracking-tight text-harbor-navy sm:text-5xl lg:text-6xl"
              >
                Predict. Plan. Ship.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                PortIQ gives importers and exporters an estimated container
                dwell time, an indicative cost breakdown and a capacity forecast
                before cargo moves.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/signup">Create account</Link>
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted">
                Public accounts are created for importers and exporters.
              </p>
            </div>
            <RouteMotif />
          </div>
        </section>

        <section
          aria-labelledby="how-title"
          className="border-b border-border bg-surface"
        >
          <div className="mx-auto max-w-content px-4 py-16 sm:px-8 sm:py-20">
            <h2
              id="how-title"
              className="text-balance text-2xl font-semibold tracking-tight text-harbor-navy sm:text-3xl"
            >
              How it works
            </h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className="rounded-lg border border-border bg-canvas p-6"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-light-teal text-sm font-semibold text-harbor-navy"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-harbor-navy">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="limits-title">
          <div className="mx-auto max-w-content px-4 py-16 sm:px-8 sm:py-20">
            <div className="max-w-2xl">
              <h2
                id="limits-title"
                className="text-balance text-2xl font-semibold tracking-tight text-harbor-navy sm:text-3xl"
              >
                Honest limitations
              </h2>
              <p className="mt-3 text-muted">
                What this prototype does and does not do.
              </p>
            </div>
            <dl className="mt-8 grid gap-6 sm:grid-cols-3">
              {LIMITATIONS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-border bg-surface p-6"
                >
                  <dt className="flex items-center gap-2 text-base font-semibold text-harbor-navy">
                    <item.icon
                      aria-hidden="true"
                      className="h-5 w-5 text-ocean-teal"
                    />
                    {item.title}
                  </dt>
                  <dd className="mt-2 text-sm leading-relaxed text-muted">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-content flex-col gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>PortIQ. Planning estimates only.</p>
          {isMockMode() ? <DemoBadge /> : null}
        </div>
      </footer>
    </div>
  );
}
