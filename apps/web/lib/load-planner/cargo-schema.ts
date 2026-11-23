import { z } from "zod";
import type { CargoItemCreate, ContainerSizeFt } from "@/lib/api/types";

export const CARGO_CATEGORY_OPTIONS = ["box", "crate", "pallet", "drum", "fragile"] as const;

/** Internal size in cm (length, width, height), matching the API's fit check. */
const INTERNAL_CM: Record<ContainerSizeFt, [number, number, number]> = {
  20: [590, 235, 239],
  40: [1203, 235, 239],
};

const number = (label: string, min: number, max: number, unit: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}.`)
    .refine((value) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= min && n <= max;
    }, `${label[0].toUpperCase()}${label.slice(1)} must be ${min}–${max}${unit && ` ${unit}`}.`);

/** Mirrors the contract's limits (CG-022); the server checks them again. */
export function cargoFormSchema(size: ContainerSizeFt) {
  const [L, W, H] = INTERNAL_CM[size];
  return z
    .object({
      name: z.string().trim().min(1, "Enter a name.").max(80, "Use 80 characters or fewer."),
      category: z.enum(CARGO_CATEGORY_OPTIONS),
      length_cm: number("length", 1, 1203, "cm"),
      width_cm: number("width", 1, 1203, "cm"),
      height_cm: number("height", 1, 1203, "cm"),
      weight_kg: number("weight", 0.1, 30000, "kg"),
      quantity: number("quantity", 1, 500, "").refine(
        (value) => Number.isInteger(Number(value)),
        "Quantity must be a whole number.",
      ),
      stackable: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const l = Number(values.length_cm);
      const w = Number(values.width_cm);
      const h = Number(values.height_cm);
      // Parcels turn only about the vertical axis, so height must fit as is.
      const fits = h <= H && ((l <= L && w <= W) || (w <= L && l <= W));
      if (Number.isFinite(l + w + h) && !fits) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["length_cm"],
          message: `Too big for a ${size} ft container (inside ${L} × ${W} × ${H} cm).`,
        });
      }
    });
}

export type CargoFormValues = z.input<ReturnType<typeof cargoFormSchema>>;

export function toCargoCreate(values: CargoFormValues): CargoItemCreate {
  return {
    name: values.name.trim(),
    category: values.category,
    length_cm: Number(values.length_cm),
    width_cm: Number(values.width_cm),
    height_cm: Number(values.height_cm),
    weight_kg: Number(values.weight_kg),
    quantity: Number(values.quantity),
    stackable: values.stackable,
  };
}
