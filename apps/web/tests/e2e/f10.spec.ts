import { expect, test, type Page } from "@playwright/test";

type Role = "importer_exporter" | "port_operator" | "platform_admin";

async function authenticate(page: Page, role: Role, path: string) {
  await page.goto("/login");
  await page.evaluate((nextRole) => {
    window.sessionStorage.setItem("portiq.mock.auth", "1");
    window.localStorage.setItem("portiq.mock.role", nextRole);
  }, role);
  await page.goto(path);
}

async function capture(page: Page, name: string) {
  await expect(page.locator("main")).not.toBeEmpty();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `test-results/f10-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

async function fillShipmentForm(page: Page, reference: string) {
  await expect(page.getByRole("option", { name: /INNSA/ })).toBeAttached();
  await page.getByRole("combobox", { name: /^Port/ }).selectOption("port_nsa");
  await page.getByLabel(/^Reference/).fill(reference);
  await page
    .getByRole("combobox", { name: /^Direction/ })
    .selectOption("import");
  await page
    .getByRole("combobox", { name: /^Cargo type/ })
    .selectOption("general_container");
  await page
    .getByRole("combobox", { name: /^Container size/ })
    .selectOption("40");
  await page.getByLabel(/^HS code/).fill("850440");
  await page.getByLabel(/^Weight/).fill("18000");
  await page.getByLabel(/^Declared value/).fill("2500000.00");
  await page
    .getByRole("combobox", { name: /^Shipping line/ })
    .selectOption("Line A");
  await page
    .getByRole("combobox", { name: /^Vessel size band/ })
    .selectOption("large");
  await page.getByLabel(/^Expected arrival/).fill("2026-11-05T08:30");
  await page
    .getByRole("combobox", { name: /^Documentation status/ })
    .selectOption("complete");
}

async function tabUntil(page: Page, text: string, max = 40) {
  for (let index = 0; index < max; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;

      return {
        tag: element?.tagName ?? "",
        text: element?.textContent?.trim() ?? "",
      };
    });

    // The first Tab after a client-side navigation can land on <body>; its
    // textContent is the whole page, so it would match everything.
    if (focused.tag !== "BODY" && focused.text.includes(text)) {
      return;
    }
  }

  throw new Error(`Could not reach "${text}" with the Tab key.`);
}

test.describe("F10 - Landing, settings, accessibility and E2E flows", () => {
  test("landing states the promise, the three steps and the limitations", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Predict. Plan. Ship." }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    for (const step of [
      "Create a shipment",
      "Run a prediction",
      "Plan with the forecast",
    ]) {
      await expect(page.getByRole("heading", { name: step })).toBeVisible();
    }

    await expect(
      page.getByRole("heading", { name: "Honest limitations" }),
    ).toBeVisible();
    await expect(page.getByText("No terminal integration")).toBeVisible();
    await expect(page.getByText("Estimates, not guarantees")).toBeVisible();
    await expect(page.getByText("Synthetic demo data").first()).toBeVisible();

    await expect(
      page.getByRole("banner").getByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/login");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/signup");
    await expect(
      page.getByRole("main").getByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/login");
    await expect(
      page.getByRole("main").getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/signup");

    await capture(page, "landing");
  });

  test("landing is mobile friendly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Predict. Plan. Ship." }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Sign in" }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Create account" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await capture(page, "landing-mobile");
  });

  test("importer creates a shipment, runs a prediction and sees the result", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill("importer@portiq.demo");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/dashboard");

    await page.getByRole("link", { name: "Shipments" }).click();
    await expect(page.getByRole("heading", { name: "Shipments" })).toBeVisible();

    // Status is never colour-only: the row carries the label and an icon.
    const firstRow = page
      .getByRole("table", { name: "Shipments" })
      .getByRole("row")
      .nth(1);
    const statusCell = firstRow.getByRole("cell", {
      name: /^(Submitted|Arrived|Cleared)$/,
    });
    await expect(statusCell).toBeVisible();
    await expect(statusCell.locator("svg")).toHaveCount(1);

    await page.getByRole("link", { name: "Create shipment" }).click();
    await expect(page.getByRole("heading", { name: "New shipment" })).toBeVisible();

    await fillShipmentForm(page, "F10-2026-001");
    await capture(page, "create-form");

    await page.getByRole("button", { name: "Create shipment" }).click();
    await expect(page).toHaveURL(/\/shipments\/ship_[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "F10-2026-001",
    );
    await capture(page, "shipment-detail");

    await page.getByRole("button", { name: "Run prediction" }).click();
    await page.waitForURL(/\/shipments\/ship_[a-z0-9]+\/prediction\/pred_/);
    await expect(
      page.getByRole("heading", { name: "Prediction result" }),
    ).toBeVisible();
    await expect(
      page.getByText(/^Estimated dwell time: \d+\.\d days$/),
    ).toBeVisible();
    // Chart summary plus a table alternative, not a picture-only result.
    await expect(
      page.getByRole("img", { name: /diverging bar chart/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "What it means" }),
    ).toBeVisible();
    await expect(
      page.getByText(/PortIQ provides planning estimates/).last(),
    ).toBeVisible();
    await capture(page, "prediction-result");
  });

  test("operator sees scoped data only", async ({ page }) => {
    await authenticate(page, "port_operator", "/operator");
    await expect(
      page.getByRole("heading", { name: "Operator overview" }),
    ).toBeVisible();
    await expect(
      page.getByText("Port scope: Nhava Sheva (JNPA), Singapore"),
    ).toBeVisible();

    const table = page.getByRole("table", { name: "Operator shipments" });
    await expect(table).toBeVisible();
    const references = (await table.getByRole("link").allTextContents()).map(
      (value) => value.trim(),
    );
    expect(references.length).toBeGreaterThan(0);
    expect(references.every((value) => /^OPS-2026-\d+$/.test(value))).toBe(true);
    await expect(table.getByText(/SHIP-2026-/)).toHaveCount(0);

    await capture(page, "operator-scope");

    await page.goto("/shipments");
    await expect(page.getByText("Access denied")).toBeVisible();
    await expect(page.getByRole("table", { name: "Shipments" })).toHaveCount(0);
  });

  test("importer cannot open /admin/tariffs", async ({ page }) => {
    await authenticate(page, "importer_exporter", "/admin/tariffs");

    await expect(page.getByText("Access denied")).toBeVisible();
    await expect(
      page.getByText("You do not have permission to view this page."),
    ).toBeVisible();
    await expect(page.getByRole("table", { name: "Tariff rules" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create version" })).toHaveCount(
      0,
    );

    await capture(page, "importer-permission");
  });

  test("admin creates a tariff version and it reaches the audit trail", async ({
    page,
  }) => {
    await authenticate(page, "platform_admin", "/admin/tariffs");
    await expect(page.getByRole("table", { name: "Tariff rules" })).toBeVisible();

    await page.getByLabel(/^Rule type/).selectOption("port_storage");
    await page.getByLabel(/^Rate type/).selectOption("per_day");
    await page.getByLabel(/^Port$/).selectOption("port_sin");
    await page.getByLabel(/^Rate value/).fill("900.00");
    await page.getByLabel(/^Valid from/).fill("2026-12-01");
    await page.getByLabel(/^Source note/).fill("F10 E2E synthetic rule.");
    await page.getByLabel(/^Version/).fill("tariff-f10-001");
    await page.getByRole("button", { name: "Create version" }).click();

    await expect(
      page.getByText("Tariff version tariff-f10-001 created."),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "tariff-f10-001", exact: true }),
    ).toBeVisible();
    await capture(page, "admin-created");

    await page.getByRole("tab", { name: "Audit" }).click();
    const firstAuditRow = page
      .getByRole("table", { name: "Audit logs" })
      .getByRole("row")
      .nth(1);
    await expect(
      firstAuditRow.getByRole("cell", { name: "tariff.created" }),
    ).toBeVisible();
    await expect(firstAuditRow.getByText("tariff-f10-001").first()).toBeVisible();
  });

  test("settings updates the display name and keeps the role read-only", async ({
    page,
  }) => {
    await authenticate(page, "importer_exporter", "/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Importer / exporter").first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Role" })).toHaveCount(0);
    await expect(
      page.getByText("Your role is assigned by the platform and cannot be changed here."),
    ).toBeVisible();

    const patch = page.waitForRequest(
      (request) =>
        request.method() === "PATCH" && request.url().endsWith("/api/v1/me"),
    );
    await page.getByLabel(/^Display name/).fill("F10 Importer");
    await page.getByRole("button", { name: "Save display name" }).click();

    const request = await patch;
    expect(JSON.parse(request.postData() ?? "{}")).toEqual({
      display_name: "F10 Importer",
    });
    await expect(page.getByText("Display name updated.")).toBeVisible();
    await expect(page.getByLabel(/^Display name/)).toHaveValue("F10 Importer");
    await capture(page, "settings");
  });

  test("landing, sign-in and navigation work with the keyboard only", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Predict. Plan. Ship." }),
    ).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveText("Skip to content");

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute(
      "aria-label",
      "PortIQ home",
    );

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveText("Sign in");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute("type", "email");
    await page.keyboard.type("importer@portiq.demo");

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute("type", "password");
    await page.keyboard.type("password123");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute("type", "submit");
    await page.keyboard.press("Enter");
    await page.waitForURL("/dashboard");

    await tabUntil(page, "Shipments");
    await page.keyboard.press("Enter");
    await page.waitForURL("/shipments");
    await expect(page.getByRole("heading", { name: "Shipments" })).toBeVisible();
  });
});
