import { apiClient } from "./client";
import { DISPLAY_NAME_MAX_LENGTH, type Me } from "./types";

/**
 * Body for `PATCH /me`. The endpoint accepts `display_name` only, so no other
 * field is ever sent, including `role`.
 *
 * Contract: 200 with the updated `Me` in the usual envelope. A blank or
 * over-long name (over `DISPLAY_NAME_MAX_LENGTH`, 80) returns 422
 * `VALIDATION_ERROR` with `details: [{ field: "display_name", issue }]`.
 */
export interface MeUpdate {
  display_name: string;
}

export async function updateDisplayName(displayName: string): Promise<Me> {
  const body: MeUpdate = { display_name: displayName.trim() };
  const response = await apiClient<Me>("/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return response.data;
}
