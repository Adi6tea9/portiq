"use client";

import { PageHeader } from "@/components/shell/PageHeader";
import { ChevronRight, Package, Plus } from "lucide-react";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/Field";
import { PageState } from "@/components/shared/PageState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { ShipmentStatus } from "@/lib/api/types";
import { useShipments } from "@/lib/api/hooks/useShipments";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import {
  SHIPMENT_STATUS_OPTIONS,
  humanizeOption,
  isShipmentStatus,
} from "@/lib/shipments/options";
import { SHIPMENT_PAGE_SIZE } from "@/lib/shipments/query";
import { SelectControl, type SelectOption } from "./SelectControl";

const STATUS_SELECT_OPTIONS: SelectOption[] = SHIPMENT_STATUS_OPTIONS.map(
  (value) => ({ value, label: humanizeOption(value) }),
);

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});
const DWELL_FORMATTER = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
});
const COUNT_FORMATTER = new Intl.NumberFormat("en-IN");

function formatExpectedArrival(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return `${DATE_TIME_FORMATTER.format(date)} UTC`;
}

function formatDwell(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "Not predicted yet";
  }

  return `${DWELL_FORMATTER.format(value)} ${value === 1 ? "day" : "days"}`;
}

interface ShipmentsListProps {
  mockError?: string;
}

export function ShipmentsList({ mockError }: ShipmentsListProps) {
  const router = useRouter();
  const [status, setStatus] = React.useState<ShipmentStatus | "">("");
  const [arrivalFrom, setArrivalFrom] = React.useState("");
  const [arrivalTo, setArrivalTo] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [page, setPage] = React.useState(1);
  const debouncedReference = useDebouncedValue(reference, 300);
  const query = useShipments({
    status: status || undefined,
    arrivalFrom: arrivalFrom || undefined,
    arrivalTo: arrivalTo || undefined,
    q: debouncedReference || undefined,
    page,
    pageSize: SHIPMENT_PAGE_SIZE,
    mockError,
  });

  const shipments = query.data?.shipments ?? [];
  const pagination = query.data?.pagination;
  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.page_size))
    : 1;
  const start =
    pagination && pagination.total > 0
      ? (pagination.page - 1) * pagination.page_size + 1
      : 0;
  const end = pagination
    ? Math.min(pagination.page * pagination.page_size, pagination.total)
    : 0;
  const hasFilters = Boolean(
    status || arrivalFrom || arrivalTo || reference.trim(),
  );

  function clearFilters() {
    setStatus("");
    setArrivalFrom("");
    setArrivalTo("");
    setReference("");
    setPage(1);
  }

  return (
    <div className="space-y-section">
      <PageHeader
        icon={Package}
        title="Shipments"
        description="Find a shipment by status, arrival date or reference. Open one to see its timeline, run a prediction or plan its container."
        actions={
          <Button asChild>
            <Link href="/shipments/new">
              <Plus aria-hidden="true" />
              Create shipment
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-card">
          <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <Field id="status" label="Status">
              <SelectControl
                placeholder="All statuses"
                options={STATUS_SELECT_OPTIONS}
                value={status}
                onChange={(event) => {
                  const value = event.target.value;
                  setStatus(isShipmentStatus(value) ? value : "");
                  setPage(1);
                }}
              />
            </Field>

            <Field id="arrival_from" label="Arrival from" info="Dates are matched as whole days in UTC.">
              <Input
                type="date"
                value={arrivalFrom}
                onChange={(event) => {
                  setArrivalFrom(event.target.value);
                  setPage(1);
                }}
              />
            </Field>

            <Field id="arrival_to" label="Arrival to" info="Dates are matched as whole days in UTC.">
              <Input
                type="date"
                value={arrivalTo}
                onChange={(event) => {
                  setArrivalTo(event.target.value);
                  setPage(1);
                }}
              />
            </Field>

            <Field id="reference" label="Reference">
              <Input
                type="search"
                placeholder="e.g. SHIP-2026-001"
                value={reference}
                onChange={(event) => {
                  setReference(event.target.value);
                  setPage(1);
                }}
              />
            </Field>

            <div className="sm:col-span-2 lg:col-span-1">
              <Button
                type="button"
                variant="outline"
                onClick={clearFilters}
                disabled={!hasFilters}
                className="w-full lg:w-auto"
              >
                Clear filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? <PageState state="loading" /> : null}

      {query.isError ? (
        query.error.status === 403 ? (
          <PageState state="permission" />
        ) : (
          <PageState
            state="error"
            title="Unable to load shipments"
            message={query.error.message}
            requestId={query.error.requestId}
            onRetry={() => void query.refetch()}
          />
        )
      ) : null}

      {query.isSuccess ? (
        shipments.length === 0 ? (
          <PageState
            state="empty"
            title="No shipments yet."
            message="Create your first shipment to get an estimate."
            action={{
              label: "Create shipment",
              onClick: () => router.push("/shipments/new"),
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
              <p aria-live="polite">
                Showing {COUNT_FORMATTER.format(start)}–
                {COUNT_FORMATTER.format(end)} of{" "}
                {COUNT_FORMATTER.format(pagination?.total ?? shipments.length)}
              </p>
              <p role="status" aria-live="polite">
                {query.isFetching ? "Updating…" : ""}
              </p>
            </div>

            <div
              className="app-table overflow-x-auto rounded-lg border border-border bg-surface"
              aria-busy={query.isFetching}
            >
              <table className="app-table-grid w-full min-w-[760px] table-fixed text-left text-sm">
                <caption className="sr-only">Shipments</caption>
                <colgroup>
                  <col className="w-[19%]" />
                  <col className="w-[18%]" />
                  <col className="w-[15%]" />
                  <col className="w-[24%]" />
                  <col className="w-[16%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead className="border-b border-border bg-canvas text-xs uppercase tracking-wide text-text">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Reference
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Cargo type
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Expected arrival
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Latest predicted dwell
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shipments.map((shipment) => (
                    <tr key={shipment.id} className="relative hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/shipments/${shipment.id}`}
                          className="font-medium text-harbor-navy underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {shipment.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {humanizeOption(shipment.cargo_type)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={shipment.status} />
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatExpectedArrival(shipment.expected_arrival_at)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatDwell(
                          shipment.latest_prediction?.predicted_dwell_days ??
                            null,
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* The reference link covers the row; this is only a visual cue. */}
                        <ChevronRight aria-hidden="true" className="ml-auto size-icon-sm text-muted" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.total > pagination.page_size ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pagination.page <= 1 || query.isFetching}
                >
                  Previous
                </Button>
                <p className="text-sm text-muted">
                  Page {pagination.page} of {totalPages}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={pagination.page >= totalPages || query.isFetching}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
