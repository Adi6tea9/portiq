import type { Me, Port } from "./api/types";

const KEY_PREFIX = "portiq.activePort.";

/** Operators may only pick their assigned ports; everyone else sees every port. */
export function allowedPorts(ports: Port[], me: Pick<Me, "role" | "assigned_port_ids"> | null): Port[] {
  if (me?.role !== "port_operator") return ports;
  const assigned = new Set(me.assigned_port_ids);
  return ports.filter((port) => assigned.has(port.id));
}

/**
 * The stored choice if it is still allowed; a user with exactly one port gets
 * that port; otherwise there is no default and pages keep their own.
 */
export function resolveActivePort(stored: string | null, ports: Port[]): string | null {
  if (stored && ports.some((port) => port.id === stored)) return stored;
  return ports.length === 1 ? ports[0]!.id : null;
}

export function readActivePort(userId: string): string | null {
  try {
    return window.localStorage.getItem(KEY_PREFIX + userId);
  } catch {
    return null;
  }
}

export function writeActivePort(userId: string, portId: string | null): void {
  try {
    if (portId) window.localStorage.setItem(KEY_PREFIX + userId, portId);
    else window.localStorage.removeItem(KEY_PREFIX + userId);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page view only.
  }
}
