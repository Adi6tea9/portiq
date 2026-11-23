import { describe, expect, it } from "vitest";
import { signUpErrorMessage } from "./actions";

describe("signUpErrorMessage", () => {
  it("explains known Supabase errors", () => {
    expect(signUpErrorMessage("over_email_send_rate_limit")).toMatch(/Too many emails/);
    expect(signUpErrorMessage("user_already_exists")).toMatch(/already exists/);
  });

  it("stays generic for unknown or missing codes", () => {
    expect(signUpErrorMessage("something_new")).toBe(
      "Unable to create your account. Please try again.",
    );
    expect(signUpErrorMessage(undefined)).toBe(
      "Unable to create your account. Please try again.",
    );
  });
});
