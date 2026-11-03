"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageState } from "@/components/shared/PageState";
import { Callout } from "@/components/shared/Callout";
import { DataTable } from "@/components/shared/DataTable";
import { Field } from "@/components/shared/Field";
import { SelectControl } from "@/components/features/shipments/SelectControl";
import { useAuditLogs } from "@/lib/api/hooks/useAuditLogs";
import { usePorts } from "@/lib/api/hooks/usePorts";
import { useTariffs } from "@/lib/api/hooks/useTariffs";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { ApiError } from "@/lib/api/client";
import type { AuditLogItem, TariffRule } from "@/lib/api/types";
import { createTariff, deactivateTariff } from "@/lib/tariffs/api";
import { RATE_TYPE_OPTIONS, RULE_TYPE_OPTIONS } from "@/lib/tariffs/options";
import {
  tariffFormSchema,
  toTariffCreate,
  type TariffFormValues,
} from "@/lib/tariffs/schema";
import { DemoBadge } from "@/components/shared/DemoBadge";
import {
  CARGO_TYPE_OPTIONS,
  CONTAINER_SIZE_OPTIONS,
  SHIPPING_LINE_OPTIONS,
  humanizeOption,
} from "@/lib/shipments/options";
import { formatDate } from "@/lib/format";

const RULES_PAGE_SIZE = 20;
const AUDIT_PAGE_SIZE = 10;

const RULE_TYPE_SELECT = RULE_TYPE_OPTIONS.map((value) => ({
  value,
  label: humanizeOption(value),
}));

const RATE_TYPE_SELECT = RATE_TYPE_OPTIONS.map((value) => ({
  value,
  label: humanizeOption(value),
}));

const SHIPPING_SELECT = [
  { value: "", label: "None" },
  ...SHIPPING_LINE_OPTIONS.map((value) => ({ value, label: value })),
];

const CARGO_SELECT = [
  { value: "", label: "None" },
  ...CARGO_TYPE_OPTIONS.map((value) => ({
    value,
    label: humanizeOption(value),
  })),
];

const CONTAINER_SELECT = [
  { value: "", label: "None" },
  ...CONTAINER_SIZE_OPTIONS.map((value) => ({
    value,
    label: `${value} ft`,
  })),
];

function optionalScope(rule: TariffRule, ports: { id: string; name: string }[]) {
  const parts = [
    ports.find((port) => port.id === rule.port_id)?.name ??
      rule.port_id ??
      "All ports",
    rule.hs_code_prefix ? `HS ${rule.hs_code_prefix}` : null,
    rule.shipping_line,
    rule.cargo_type ? humanizeOption(rule.cargo_type) : null,
    rule.container_size_ft ? `${rule.container_size_ft} ft` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "All shipments";
}

function JsonCell({ value }: { value: unknown | null }) {
  if (value === null || value === undefined) {
    return <span className="text-muted">—</span>;
  }

  return (
    <code className="block max-w-[220px] whitespace-pre-wrap break-words text-xs text-muted">
      {JSON.stringify(value)}
    </code>
  );
}

export function TariffsClient() {
  const portsQuery = usePorts();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState("rules");
  const [page, setPage] = React.useState(1);
  const [auditPage, setAuditPage] = React.useState(1);
  const [ruleType, setRuleType] = React.useState("");
  const [portId, setPortId] = React.useState("");
  const [hsPrefix, setHsPrefix] = React.useState("");
  const [shippingLine, setShippingLine] = React.useState("");
  const [isActive, setIsActive] = React.useState("");
  const [validOn, setValidOn] = React.useState("");
  const debouncedHsPrefix = useDebouncedValue(hsPrefix, 300);

  const [prefill, setPrefill] = React.useState<Partial<TariffFormValues> | null>(
    null,
  );
  const [deactivateTarget, setDeactivateTarget] =
    React.useState<TariffRule | null>(null);
  const [newVersionTarget, setNewVersionTarget] =
    React.useState<TariffRule | null>(null);
  const [conflict, setConflict] = React.useState<{
    rule: TariffRule | null;
    message: string;
    requestId: string;
  } | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<{
    message: string;
    requestId?: string;
  } | null>(null);

  const tariffsQuery = useTariffs({
    ruleType: ruleType || undefined,
    portId: portId || undefined,
    hsCodePrefix: debouncedHsPrefix || undefined,
    shippingLine: shippingLine || undefined,
    isActive: isActive || undefined,
    validOn: validOn || undefined,
    page,
    pageSize: RULES_PAGE_SIZE,
  });

  const auditQuery = useAuditLogs(
    { page: auditPage, pageSize: AUDIT_PAGE_SIZE },
    tab === "audit",
  );

  React.useEffect(() => {
    setPage(1);
  }, [ruleType, portId, debouncedHsPrefix, shippingLine, isActive, validOn]);

  const form = useForm<TariffFormValues>({
    resolver: zodResolver(tariffFormSchema),
    defaultValues: {
      rule_type: "customs_duty",
      rate_type: "percent_of_value",
      port_id: "",
      hs_code_prefix: "",
      shipping_line: "",
      cargo_type: "",
      container_size_ft: "",
      rate_value: "",
      currency: "INR",
      free_days: "",
      valid_from: "",
      valid_to: "",
      source_note: "",
      version: "",
      tier_config: "",
    },
  });

  React.useEffect(() => {
    if (!prefill) {
      return;
    }

    form.reset({
      rule_type: prefill.rule_type ?? "customs_duty",
      rate_type: prefill.rate_type ?? "percent_of_value",
      port_id: prefill.port_id ?? "",
      hs_code_prefix: prefill.hs_code_prefix ?? "",
      shipping_line: prefill.shipping_line ?? "",
      cargo_type: prefill.cargo_type ?? "",
      container_size_ft: prefill.container_size_ft ?? "",
      rate_value: prefill.rate_value ?? "",
      currency: "INR",
      free_days: prefill.free_days ?? "",
      valid_from: "",
      valid_to: "",
      source_note: prefill.source_note ?? "",
      version: "",
      tier_config: prefill.tier_config ?? "",
    });
    setPrefill(null);
  }, [prefill, form]);

  const ports = portsQuery.data ?? [];
  const rules = tariffsQuery.data?.rules ?? [];
  const pagination = tariffsQuery.data?.pagination;
  const auditLogs = auditQuery.data?.logs ?? [];
  const auditPagination = auditQuery.data?.pagination;
  const rateType = form.watch("rate_type");
  const errors = form.formState.errors;

  const portOptions = [
    { value: "", label: "All ports" },
    ...ports.map((port) => ({ value: port.id, label: port.name })),
  ];

  async function onSubmit(values: TariffFormValues) {
    setFormError(null);
    setNotice(null);

    try {
      const created = await createTariff(toTariffCreate(values));
      form.reset();
      setNotice(`Tariff version ${created.version} created.`);
      await queryClient.invalidateQueries({ queryKey: ["tariffs"] });
      await queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError({ message: "Something went wrong." });
        return;
      }

      if (error.code === "TARIFF_CONFLICT") {
        const matched =
          rules.find(
            (rule) =>
              rule.version === values.version.trim() &&
              rule.rule_type === values.rule_type,
          ) ?? null;

        setConflict({
          rule: matched,
          message: error.message,
          requestId: error.requestId,
        });
        return;
      }

      for (const detail of error.details ?? []) {
        form.setError(detail.field as keyof TariffFormValues, {
          type: "server",
          message: detail.issue,
        });
      }

      setFormError({ message: error.message, requestId: error.requestId });
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) {
      return;
    }

    const version = deactivateTarget.version;
    setNotice(null);

    try {
      await deactivateTariff(deactivateTarget.id);
      await queryClient.invalidateQueries({ queryKey: ["tariffs"] });
      await queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      setNotice(`Tariff version ${version} deactivated.`);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? { message: error.message, requestId: error.requestId }
          : { message: "Something went wrong." },
      );
    } finally {
      setDeactivateTarget(null);
    }
  }

  const columns: ColumnDef<TariffRule, unknown>[] = [
    {
      header: "Rule type",
      cell: ({ row }) => humanizeOption(row.original.rule_type),
    },
    {
      header: "Scope",
      cell: ({ row }) => (
        <span className="text-muted">{optionalScope(row.original, ports)}</span>
      ),
    },
    {
      header: "Rate",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span>
          <span className="tabular-nums">{row.original.rate_value}</span>{" "}
          {row.original.currency}
          <span className="block text-xs text-muted">
            {humanizeOption(row.original.rate_type)}
            {row.original.free_days === null
              ? ""
              : ` · ${row.original.free_days} free days`}
          </span>
        </span>
      ),
    },
    {
      header: "Valid",
      cell: ({ row }) =>
        `${formatDate(row.original.valid_from, "UTC")} – ${
          row.original.valid_to
            ? formatDate(row.original.valid_to, "UTC")
            : "Open"
        }`,
    },
    {
      header: "Version",
      cell: ({ row }) => <span className="font-medium">{row.original.version}</span>,
    },
    {
      header: "Status",
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge className="border-transparent bg-light-teal text-harbor-navy">
            Active
          </Badge>
        ) : (
          <Badge variant="outline">Inactive</Badge>
        ),
    },
    {
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Create new version from ${row.original.version}`}
            onClick={() => setNewVersionTarget(row.original)}
          >
            Create new version
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Deactivate ${row.original.version}`}
            disabled={!row.original.is_active}
            onClick={() => setDeactivateTarget(row.original)}
          >
            Deactivate
          </Button>
        </div>
      ),
    },
  ];

  const auditColumns: ColumnDef<AuditLogItem, unknown>[] = [
    {
      header: "When",
      cell: ({ row }) => formatDate(row.original.created_at, "UTC"),
    },
    {
      header: "Actor",
      cell: ({ row }) => row.original.actor_display_name ?? "System",
    },
    { header: "Action", cell: ({ row }) => row.original.action },
    {
      header: "Entity",
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.entity_type} / {row.original.entity_id}
        </span>
      ),
    },
    { header: "Before", cell: ({ row }) => <JsonCell value={row.original.before} /> },
    { header: "After", cell: ({ row }) => <JsonCell value={row.original.after} /> },
  ];

  const hasFilters = Boolean(
    ruleType || portId || hsPrefix || shippingLine || isActive || validOn,
  );

  function clearFilters() {
    setRuleType("");
    setPortId("");
    setHsPrefix("");
    setShippingLine("");
    setIsActive("");
    setValidOn("");
  }

  if (tariffsQuery.isError && tariffsQuery.error.status === 403) {
    return <PageState state="permission" />;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-harbor-navy">Tariffs</h1>
          <p className="text-sm text-muted">
            Manage tariff rules and review the change trail.
          </p>
        </div>
        <DemoBadge>Demo tariff data</DemoBadge>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New version</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                noValidate
                className="grid gap-4 md:grid-cols-2"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <Field
                  id="tariff-rule-type"
                  label="Rule type"
                  required
                  error={errors.rule_type?.message}
                >
                  <SelectControl
                    options={RULE_TYPE_SELECT}
                    {...form.register("rule_type")}
                  />
                </Field>
                <Field
                  id="tariff-rate-type"
                  label="Rate type"
                  required
                  error={errors.rate_type?.message}
                >
                  <SelectControl
                    options={RATE_TYPE_SELECT}
                    {...form.register("rate_type")}
                  />
                </Field>
                <Field id="tariff-port" label="Port">
                  <SelectControl
                    options={portOptions}
                    {...form.register("port_id")}
                  />
                </Field>
                <Field
                  id="tariff-hs-prefix"
                  label="HS code prefix"
                  error={errors.hs_code_prefix?.message}
                >
                  <Input
                    inputMode="numeric"
                    spellCheck={false}
                    placeholder="85"
                    {...form.register("hs_code_prefix")}
                  />
                </Field>
                <Field id="tariff-shipping-line" label="Shipping line">
                  <SelectControl
                    options={SHIPPING_SELECT}
                    {...form.register("shipping_line")}
                  />
                </Field>
                <Field id="tariff-cargo-type" label="Cargo type">
                  <SelectControl
                    options={CARGO_SELECT}
                    {...form.register("cargo_type")}
                  />
                </Field>
                <Field id="tariff-container-size" label="Container size">
                  <SelectControl
                    options={CONTAINER_SELECT}
                    {...form.register("container_size_ft")}
                  />
                </Field>
                <Field
                  id="tariff-rate-value"
                  label="Rate value"
                  required
                  hint="Decimal string, e.g. 850.00"
                  error={errors.rate_value?.message}
                >
                  <Input
                    inputMode="decimal"
                    placeholder="850.00"
                    {...form.register("rate_value")}
                  />
                </Field>
                <Field
                  id="tariff-free-days"
                  label="Free days"
                  error={errors.free_days?.message}
                >
                  <Input
                    type="number"
                    min="0"
                    placeholder="3"
                    {...form.register("free_days")}
                  />
                </Field>
                <Field
                  id="tariff-valid-from"
                  label="Valid from"
                  required
                  error={errors.valid_from?.message}
                >
                  <Input type="date" {...form.register("valid_from")} />
                </Field>
                <Field
                  id="tariff-valid-to"
                  label="Valid to"
                  hint="Leave blank for open-ended"
                  error={errors.valid_to?.message}
                >
                  <Input type="date" {...form.register("valid_to")} />
                </Field>
                <Field
                  id="tariff-version"
                  label="Version"
                  required
                  error={errors.version?.message}
                >
                  <Input
                    spellCheck={false}
                    placeholder="tariff-v2.4"
                    {...form.register("version")}
                  />
                </Field>
                <Field
                  id="tariff-source-note"
                  label="Source note"
                  required
                  className="md:col-span-2"
                  error={errors.source_note?.message}
                >
                  <Input
                    placeholder="Synthetic demo tariff update."
                    {...form.register("source_note")}
                  />
                </Field>
                {rateType === "tiered" ? (
                  <Field
                    id="tariff-tier-config"
                    label="Tier config (JSON)"
                    required
                    className="md:col-span-2"
                    error={errors.tier_config?.message}
                  >
                    <textarea
                      className="min-h-[120px] w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder='{"tiers":[{"up_to_days":3,"rate":"1200.00"},{"up_to_days":null,"rate":"2400.00"}]}'
                      {...form.register("tier_config")}
                    />
                  </Field>
                ) : null}
                {formError ? (
                  <div className="md:col-span-2">
                    <Callout variant="danger">
                      <p>{formError.message}</p>
                      {formError.requestId ? (
                        <p className="mt-1 font-mono text-xs">
                          Request ID: {formError.requestId}
                        </p>
                      ) : null}
                    </Callout>
                  </div>
                ) : null}
                {notice ? (
                  <div className="md:col-span-2">
                    <Callout variant="info">{notice}</Callout>
                  </div>
                ) : null}
                <div className="flex justify-end md:col-span-2">
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    Create version
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Field id="filter-rule-type" label="Filter rule type">
                  <SelectControl
                    placeholder="All"
                    options={RULE_TYPE_SELECT}
                    value={ruleType}
                    onChange={(event) => setRuleType(event.target.value)}
                  />
                </Field>
                <Field id="filter-port" label="Filter port">
                  <SelectControl
                    options={portOptions}
                    value={portId}
                    onChange={(event) => setPortId(event.target.value)}
                  />
                </Field>
                <Field id="filter-hs-prefix" label="Filter HS prefix">
                  <Input
                    inputMode="numeric"
                    spellCheck={false}
                    value={hsPrefix}
                    placeholder="85"
                    onChange={(event) => setHsPrefix(event.target.value)}
                  />
                </Field>
                <Field id="filter-shipping-line" label="Filter shipping line">
                  <SelectControl
                    placeholder="All"
                    options={SHIPPING_LINE_OPTIONS.map((value) => ({
                      value,
                      label: value,
                    }))}
                    value={shippingLine}
                    onChange={(event) => setShippingLine(event.target.value)}
                  />
                </Field>
                <Field id="filter-status" label="Filter status">
                  <SelectControl
                    options={[
                      { value: "", label: "All" },
                      { value: "true", label: "Active" },
                      { value: "false", label: "Inactive" },
                    ]}
                    value={isActive}
                    onChange={(event) => setIsActive(event.target.value)}
                  />
                </Field>
                <Field id="filter-valid-on" label="Filter valid on">
                  <Input
                    type="date"
                    value={validOn}
                    onChange={(event) => setValidOn(event.target.value)}
                  />
                </Field>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearFilters}
                  disabled={!hasFilters}
                >
                  Clear filters
                </Button>
              </div>

              {tariffsQuery.isError ? (
                <PageState
                  state="error"
                  title="Unable to load tariffs"
                  message={tariffsQuery.error.message}
                  requestId={tariffsQuery.error.requestId}
                  onRetry={() => void tariffsQuery.refetch()}
                />
              ) : null}

              {tariffsQuery.isLoading && !tariffsQuery.data ? (
                <PageState state="loading" />
              ) : null}

              {tariffsQuery.isSuccess ? (
                <DataTable
                  columns={columns}
                  data={rules}
                  caption="Tariff rules"
                  getRowId={(row) => row.id}
                  pagination={pagination}
                  onPageChange={setPage}
                  isLoading={tariffsQuery.isFetching && !tariffsQuery.isLoading}
                  emptyMessage="No tariff rules match the filters."
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              {auditQuery.isError ? (
                auditQuery.error.status === 403 ? (
                  <PageState state="permission" />
                ) : (
                  <PageState
                    state="error"
                    title="Unable to load audit logs"
                    message={auditQuery.error.message}
                    requestId={auditQuery.error.requestId}
                    onRetry={() => void auditQuery.refetch()}
                  />
                )
              ) : null}

              {auditQuery.isLoading && !auditQuery.data ? (
                <PageState state="loading" />
              ) : null}

              {auditQuery.isSuccess ? (
                <DataTable
                  columns={auditColumns}
                  data={auditLogs}
                  caption="Audit logs"
                  getRowId={(row) => row.id}
                  pagination={auditPagination}
                  onPageChange={setAuditPage}
                  isLoading={auditQuery.isFetching && !auditQuery.isLoading}
                  emptyMessage="No audit logs."
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate tariff rule</DialogTitle>
            <DialogDescription>
              Deactivate {deactivateTarget?.version}? The rule stays in the
              table and its history is kept; there is no delete action. Earlier
              predictions keep the version they used.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleDeactivate()}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newVersionTarget !== null}
        onOpenChange={(open) => !open && setNewVersionTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new version</DialogTitle>
            <DialogDescription>
              Start a new version based on {newVersionTarget?.version}. The
              current rule stays active until you deactivate it yourself, and
              nothing is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewVersionTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setPrefill({
                  rule_type: newVersionTarget?.rule_type,
                  rate_type: newVersionTarget?.rate_type,
                  port_id: newVersionTarget?.port_id ?? "",
                  hs_code_prefix: newVersionTarget?.hs_code_prefix ?? "",
                  shipping_line: newVersionTarget?.shipping_line ?? "",
                  cargo_type: newVersionTarget?.cargo_type ?? "",
                  container_size_ft:
                    newVersionTarget?.container_size_ft === null ||
                    newVersionTarget?.container_size_ft === undefined
                      ? ""
                      : String(newVersionTarget.container_size_ft),
                  rate_value: newVersionTarget?.rate_value ?? "",
                  currency: "INR",
                  free_days:
                    newVersionTarget?.free_days === null ||
                    newVersionTarget?.free_days === undefined
                      ? ""
                      : String(newVersionTarget.free_days),
                  source_note: newVersionTarget?.source_note ?? "",
                  version: "",
                  tier_config: newVersionTarget?.tier_config
                    ? JSON.stringify(newVersionTarget.tier_config, null, 2)
                    : "",
                });
                setNewVersionTarget(null);
                setTab("rules");
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={conflict !== null}
        onOpenChange={(open) => !open && setConflict(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tariff conflict</DialogTitle>
            <DialogDescription>
              {conflict?.message ??
                "A tariff rule with this version already exists."}
            </DialogDescription>
          </DialogHeader>
          {conflict?.rule ? (
            <div className="rounded-md border border-border bg-canvas p-3 text-sm">
              <p className="font-medium text-text">{conflict.rule.version}</p>
              <p className="text-muted">
                {humanizeOption(conflict.rule.rule_type)} ·{" "}
                {conflict.rule.rate_value} {conflict.rule.currency}
              </p>
              <p className="text-muted">
                Valid from {formatDate(conflict.rule.valid_from, "UTC")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              The conflicting rule is not on this page. Clear the filters or
              page through the table to find it.
            </p>
          )}
          {conflict?.requestId ? (
            <p className="font-mono text-xs text-muted">
              Request ID: {conflict.requestId}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConflict(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
