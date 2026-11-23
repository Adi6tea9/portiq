"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Callout } from "@/components/shared/Callout";
import { Field } from "@/components/shared/Field";
import { SelectControl } from "@/components/features/shipments/SelectControl";
import {
  containerFullDetail,
  useCreateCargo,
  useDeleteCargo,
  useSharedContainers,
  useUpdateCargo,
} from "@/lib/api/hooks/useLoadPlan";
import type {
  CargoItem,
  CargoItemCreate,
  CargoItemPost,
  ContainerFullDetail,
  Shipment,
} from "@/lib/api/types";
import {
  CARGO_CATEGORY_OPTIONS,
  cargoFormSchema,
  toCargoCreate,
  type CargoFormValues,
} from "@/lib/load-planner/cargo-schema";
import { CARGO_CATEGORIES } from "@/lib/load-planner/config";

const CATEGORY_OPTIONS = CARGO_CATEGORY_OPTIONS.map((id) => ({
  value: id,
  label: CARGO_CATEGORIES[id].name,
}));

const EMPTY: CargoFormValues = {
  name: "",
  category: "box",
  length_cm: "",
  width_cm: "",
  height_cm: "",
  weight_kg: "",
  quantity: "1",
  stackable: true,
};

const toForm = (item: CargoItem): CargoFormValues => ({
  name: item.name,
  category: item.category,
  length_cm: String(item.length_cm),
  width_cm: String(item.width_cm),
  height_cm: String(item.height_cm),
  weight_kg: String(item.weight_kg),
  quantity: String(item.quantity),
  stackable: item.stackable,
});

interface CargoPanelProps {
  shipment: Shipment;
  cargo: readonly CargoItem[];
  editable: boolean;
}

/** The owner's cargo lines. The server packs them; nobody arranges parcels by hand. */
export function CargoPanel({ shipment, cargo, editable }: CargoPanelProps) {
  const [editing, setEditing] = React.useState<CargoItem | null>(null);
  const [full, setFull] = React.useState<{
    body: CargoItemCreate;
    detail: ContainerFullDetail;
    isEdit: boolean;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const create = useCreateCargo(shipment.id);
  const update = useUpdateCargo(shipment.id);
  const remove = useDeleteCargo(shipment.id);
  const shared = shipment.booking_type === "shared";
  const containers = useSharedContainers(shipment.id, shared && !!full && !full.isEdit);

  const form = useForm<CargoFormValues>({
    resolver: zodResolver(cargoFormSchema(shipment.container_size_ft)),
    defaultValues: EMPTY,
  });
  const { register, handleSubmit, reset, formState } = form;
  const { errors } = formState;

  const handleError = (err: unknown, body: CargoItemCreate, isEdit: boolean) => {
    const detail = containerFullDetail(err);
    if (detail) setFull({ body, detail, isEdit });
    else setError(err instanceof Error ? err.message : "Could not save the cargo line.");
  };

  const send = async (post: CargoItemPost) => {
    setError(null);
    try {
      await create.mutateAsync(post);
      setFull(null);
      reset(EMPTY);
    } catch (err) {
      handleError(err, post, false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    const body = toCargoCreate(values);
    if (!editing) return send(body);
    setError(null);
    try {
      await update.mutateAsync({ id: editing.id, patch: body });
      setEditing(null);
      reset(EMPTY);
    } catch (err) {
      handleError(err, body, true);
    }
  });

  const startEdit = (item: CargoItem) => {
    setEditing(item);
    reset(toForm(item));
  };

  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-3">
      {cargo.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Cargo lines">
          {cargo.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-medium text-text">{item.name}</span>
                <span className="block text-xs text-muted">
                  {CARGO_CATEGORIES[item.category]?.name} · {item.length_cm}×{item.width_cm}×
                  {item.height_cm} cm · {item.weight_kg} kg × {item.quantity}
                </span>
              </span>
              {editable && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => startEdit(item)}
                  >
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${item.name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(item.id)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-xl border border-border p-3">
          <h3 className="text-sm font-semibold text-text">
            {editing ? `Edit ${editing.name}` : "Add cargo"}
          </h3>
          <Field id="cargo-name" label="Name" error={errors.name?.message} required>
            <Input autoComplete="off" {...register("name")} />
          </Field>
          <Field id="cargo-category" label="Category" error={errors.category?.message} required>
            <SelectControl options={CATEGORY_OPTIONS} {...register("category")} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field id="cargo-length" label="Length cm" error={errors.length_cm?.message} required>
              <Input inputMode="decimal" {...register("length_cm")} />
            </Field>
            <Field id="cargo-width" label="Width cm" error={errors.width_cm?.message} required>
              <Input inputMode="decimal" {...register("width_cm")} />
            </Field>
            <Field id="cargo-height" label="Height cm" error={errors.height_cm?.message} required>
              <Input inputMode="decimal" {...register("height_cm")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field id="cargo-weight" label="Weight kg (each)" error={errors.weight_kg?.message} required>
              <Input inputMode="decimal" {...register("weight_kg")} />
            </Field>
            <Field id="cargo-quantity" label="Quantity" error={errors.quantity?.message} required>
              <Input inputMode="numeric" {...register("quantity")} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" {...register("stackable")} />
            Other cargo may be stacked on top
          </label>
          {error && <Callout variant="danger">{error}</Callout>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {editing ? "Save line" : "Add cargo"}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  reset(EMPTY);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">
            The container is packed automatically after each change.
          </p>
        </form>
      ) : (
        <p className="text-xs text-muted">
          Read only. Cargo can be changed by the shipment owner while it is submitted.
        </p>
      )}

      <ContainerFullDialog
        state={full}
        shared={shared}
        containers={containers.data ?? []}
        busy={busy}
        onSplit={() =>
          full &&
          send({
            ...full.body,
            ...(full.detail.container_id ? { container_id: full.detail.container_id } : {}),
            allow_split: true,
          })
        }
        onPick={(containerId) => full && send({ ...full.body, container_id: containerId })}
        onClose={() => setFull(null)}
      />
    </div>
  );
}

function ContainerFullDialog({
  state,
  shared,
  containers,
  busy,
  onSplit,
  onPick,
  onClose,
}: {
  state: { detail: ContainerFullDetail; isEdit: boolean } | null;
  shared: boolean;
  containers: { id: string; sequence: number; remaining_volume_m3: number }[];
  busy: boolean;
  onSplit: () => void;
  onPick: (containerId: string) => void;
  onClose: () => void;
}) {
  const detail = state?.detail;
  const canMove = shared && !state?.isEdit;
  const rest = detail ? detail.requested_quantity - detail.fits_quantity : 0;
  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Container {detail?.sequence} is full</DialogTitle>
          <DialogDescription>
            {detail &&
              `${detail.remaining_volume_m3.toFixed(1)} m³ and ${Math.round(
                detail.remaining_payload_kg,
              ).toLocaleString("en-GB")} kg left. ${detail.fits_quantity} of ${
                detail.requested_quantity
              } units fit.`}
          </DialogDescription>
        </DialogHeader>
        {canMove && detail && (
          <div className="space-y-3">
            {detail.fits_quantity > 0 && (
              <Button className="w-full" disabled={busy} onClick={onSplit}>
                Put {detail.fits_quantity} here, rest ({rest}) in next container
              </Button>
            )}
            {containers.filter((c) => c.id !== detail.container_id).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text">Or send it all to another container</p>
                <ul className="space-y-1.5">
                  {containers
                    .filter((c) => c.id !== detail.container_id)
                    .map((c) => (
                      <li key={c.id}>
                        <Button
                          variant="outline"
                          className="w-full justify-between"
                          disabled={busy}
                          onClick={() => onPick(c.id)}
                        >
                          <span>Container {c.sequence}</span>
                          <span className="text-muted">
                            {c.remaining_volume_m3.toFixed(1)} m³ left
                          </span>
                        </Button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Change the cargo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
