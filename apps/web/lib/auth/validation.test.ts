import { describe, expect, it } from "vitest";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "./validation";

describe("loginSchema", () => {
  it("requires a valid email and a password", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
        "email",
        "password",
      ]);
    }
  });

  it("accepts valid credentials", () => {
    expect(
      loginSchema.safeParse({
        email: "importer@portiq.demo",
        password: "password",
      }).success,
    ).toBe(true);
  });
});

describe("signupSchema", () => {
  it("requires at least eight password characters", () => {
    const result = signupSchema.safeParse({
      email: "importer@portiq.demo",
      password: "short",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Password must be at least 8 characters.",
      );
    }
  });
});

describe("recovery schemas", () => {
  it("validate the email and new password", () => {
    expect(forgotPasswordSchema.safeParse({ email: "bad" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "short" }).success).toBe(
      false,
    );
    expect(
      resetPasswordSchema.safeParse({ password: "long-enough" }).success,
    ).toBe(true);
  });
});
