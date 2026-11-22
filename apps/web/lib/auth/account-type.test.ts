import { describe, expect, it } from "vitest";
import { accountTypeMismatch } from "./account-type";

describe("accountTypeMismatch", () => {
  it("accepts accounts that match the chosen tab", () => {
    expect(accountTypeMismatch("importer", "importer_exporter")).toBeNull();
    expect(accountTypeMismatch("operator", "port_operator")).toBeNull();
    expect(accountTypeMismatch("operator", "platform_admin")).toBeNull();
  });

  it("names the right tab when the account does not match", () => {
    expect(accountTypeMismatch("importer", "port_operator")).toBe(
      "This is a Port Operator account. Switch to Port Operator to sign in.",
    );
    expect(accountTypeMismatch("importer", "platform_admin")).toBe(
      "This is a Port Operator account. Switch to Port Operator to sign in.",
    );
    expect(accountTypeMismatch("operator", "importer_exporter")).toBe(
      "This is an Importer / Exporter account. Switch to Importer / Exporter to sign in.",
    );
  });
});
