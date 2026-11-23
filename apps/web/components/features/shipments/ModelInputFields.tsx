"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { Field } from "@/components/shared/Field";
import {
  CARGO_PRIORITY_OPTIONS,
  CUSTOMS_CHANNEL_OPTIONS,
  IMPORTER_TYPE_OPTIONS,
  MODEL_INPUT_LABELS,
} from "@/lib/shipments/options";
import { SelectControl, type SelectOption } from "./SelectControl";

const toSelect = (values: readonly string[]): SelectOption[] =>
  values.map((value) => ({ value, label: MODEL_INPUT_LABELS[value] ?? value }));

const CUSTOMS_CHANNEL_SELECT = toSelect(CUSTOMS_CHANNEL_OPTIONS);
const IMPORTER_TYPE_SELECT = toSelect(IMPORTER_TYPE_OPTIONS);
const CARGO_PRIORITY_SELECT = toSelect(CARGO_PRIORITY_OPTIONS);

interface ModelInputFieldsProps {
  registered: {
    customs_channel: UseFormRegisterReturn;
    importer_type: UseFormRegisterReturn;
    cargo_priority: UseFormRegisterReturn;
  };
  errors: Partial<Record<"customs_channel" | "importer_type" | "cargo_priority", string>>;
}

/** The three shipment details that sharpen the dwell estimate; shared by create and edit. */
export function ModelInputFields({ registered, errors }: ModelInputFieldsProps) {
  return (
    <>
      <Field
        id="customs_channel"
        label="Customs channel"
        hint="Leave as 'Not known yet' if the channel has not been assigned."
        error={errors.customs_channel}
      >
        <SelectControl options={CUSTOMS_CHANNEL_SELECT} {...registered.customs_channel} />
      </Field>
      <Field
        id="importer_type"
        label="Importer type"
        hint="AEO-certified importers usually clear faster."
        error={errors.importer_type}
      >
        <SelectControl options={IMPORTER_TYPE_SELECT} {...registered.importer_type} />
      </Field>
      <Field
        id="cargo_priority"
        label="Cargo priority"
        hint="Expedited covers perishable, medical and other urgent cargo."
        error={errors.cargo_priority}
      >
        <SelectControl options={CARGO_PRIORITY_SELECT} {...registered.cargo_priority} />
      </Field>
    </>
  );
}
