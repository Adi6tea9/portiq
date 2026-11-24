import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "../ui/label";
import { InfoTip } from "./InfoTip";

type FieldControlProps = React.HTMLAttributes<HTMLElement> & {
  required?: boolean;
};

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  /** Longer explanation shown in an "i" tip next to the label. */
  info?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement<FieldControlProps>;
}

export function Field({
  id,
  label,
  hint,
  info,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = React.cloneElement(children, {
    id,
    required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  });

  const labelEl = (
    <Label htmlFor={id}>
      {label}
      {required ? (
        <span aria-hidden="true" className="ml-1 text-danger">
          *
        </span>
      ) : null}
    </Label>
  );

  return (
    <div className={cn("space-y-2", className)}>
      {info ? (
        <div className="flex items-center gap-1">
          {labelEl}
          <InfoTip label={label}>{info}</InfoTip>
        </div>
      ) : (
        labelEl
      )}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
