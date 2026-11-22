import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/auth/account-type";
import { cn } from "@/lib/utils";

interface AccountTypeToggleProps {
  value: AccountType;
  onChange: (value: AccountType) => void;
}

const OPTIONS: AccountType[] = ["importer", "operator"];

/** Segmented Importer / Port Operator choice; native radios keep it keyboard and screen-reader friendly. */
export function AccountTypeToggle({ value, onChange }: AccountTypeToggleProps) {
  return (
    <fieldset>
      <legend className="sr-only">Account type</legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {OPTIONS.map((option) => (
          <label key={option} className="relative">
            <input
              type="radio"
              name="account-type"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex h-10 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium text-muted transition-colors",
                "hover:text-text peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:shadow-sm",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
              )}
            >
              {ACCOUNT_TYPE_LABELS[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
