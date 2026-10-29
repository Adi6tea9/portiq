import type { Role } from "@/lib/api/types";

const STORAGE_KEY = "portiq.mock.role";
const ROLES: readonly Role[] = [
  "importer_exporter",
  "port_operator",
  "platform_admin",
];
const DEFAULT_ROLE: Role = "importer_exporter";
export const MOCK_ROLE_EVENT = "portiq:mock-role";

let memoryRole: Role | null = null;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function getMockRole(): Role {
  if (memoryRole) {
    return memoryRole;
  }

  if (typeof window === "undefined") {
    return DEFAULT_ROLE;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isRole(stored) ? stored : DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}

export function setMockRole(role: Role): void {
  memoryRole = role;

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, role);
  } catch {
    return;
  }

  window.dispatchEvent(new CustomEvent<Role>(MOCK_ROLE_EVENT, { detail: role }));
}

export function resetMockRole(): void {
  memoryRole = null;
}

export function subscribeToMockRole(listener: (role: Role) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;

    if (isRole(detail)) {
      listener(detail);
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && isRole(event.newValue)) {
      listener(event.newValue);
    }
  };

  window.addEventListener(MOCK_ROLE_EVENT, onCustomEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(MOCK_ROLE_EVENT, onCustomEvent);
    window.removeEventListener("storage", onStorage);
  };
}
