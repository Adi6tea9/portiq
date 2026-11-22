import type { Role } from "@/lib/api/types";

/**
 * The sign-in toggle. It never grants a role: it only confirms which kind of
 * account the person is signing in to, checked against the role on /me.
 */
export type AccountType = "importer" | "operator";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  importer: "Importer / Exporter",
  operator: "Port Operator",
};

// Platform admins run port operations, so they sign in on the operator side.
const ROLE_ACCOUNT_TYPE: Record<Role, AccountType> = {
  importer_exporter: "importer",
  port_operator: "operator",
  platform_admin: "operator",
};

export function accountTypeForRole(role: Role): AccountType {
  return ROLE_ACCOUNT_TYPE[role];
}

/** Null when the account matches the chosen tab, otherwise the message to show. */
export function accountTypeMismatch(
  selected: AccountType,
  role: Role,
): string | null {
  const actual = accountTypeForRole(role);

  if (actual === selected) {
    return null;
  }

  const label = ACCOUNT_TYPE_LABELS[actual];
  const article = actual === "importer" ? "an" : "a";
  return `This is ${article} ${label} account. Switch to ${label} to sign in.`;
}
