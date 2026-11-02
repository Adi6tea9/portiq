import { expect, test, type Page } from "@playwright/test";

async function authenticate(
  page: Page,
  role: "importer_exporter" | "port_operator" | "platform_admin",
  path: string,
) {
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
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `test-results/f09-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

async function captureDialog(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await dialog.screenshot({
    path: `test-results/f09-${name}.png`,
    animations: "disabled",
  });
}

async function openTariffs(page: Page) {
  await authenticate(page, "platform_admin", "/admin/tariffs");
  await expect(page.getByRole("heading", { name: "Tariffs" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Tariff rules" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "tariff-v2.3", exact: true })).toBeVisible();
}

async function fillDuplicateRule(page: Page) {
  await page.getByLabel(/^Rule type/).selectOption("customs_duty");
  await page.getByLabel(/^Rate type/).selectOption("percent_of_value");
  await page.getByLabel(/^Port$/).selectOption("port_nsa");
  await page.getByLabel(/^HS code prefix/).fill("85");
  await page.getByLabel(/^Rate value/).fill("10.00");
  await page.getByLabel(/^Valid from/).fill("2026-11-01");
  await page.getByLabel(/^Source note/).fill("Conflict check.");
  await page.getByLabel(/^Version/).fill("tariff-v2.3");
}

test.describe("F09 - Admin tariffs and audit trail", () => {
  test("rules table shows the demo badge, filters and no delete control", async ({
    page,
  }) => {
    await openTariffs(page);

    await expect(page.getByText("Demo tariff data")).toBeVisible();
    await expect(page.getByRole("table", { name: "Tariff rules" })).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Rule type" }),
    ).toBeVisible();
    await expect(page.getByLabel("Filter rule type")).toBeVisible();
    await expect(page.getByLabel("Filter port")).toBeVisible();
    await expect(page.getByLabel("Filter HS prefix")).toBeVisible();
    await expect(page.getByLabel("Filter shipping line")).toBeVisible();
    await expect(page.getByLabel("Filter status")).toBeVisible();
    await expect(page.getByLabel("Filter valid on")).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Create new version from tariff-v2.3" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Deactivate tariff-v2.3" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
    await expect(page.getByText(/delete/i)).toHaveCount(0);

    await capture(page, "table");
  });

  test("new version form blocks invalid dates, rates and missing notes", async ({
    page,
  }) => {
    await openTariffs(page);

    await page.getByLabel(/^Rate value/).fill("-1");
    await page.getByLabel(/^Valid from/).fill("2026-10-10");
    await page.getByLabel(/^Valid to/).fill("2026-10-01");
    await page.getByRole("button", { name: "Create version" }).click();

    await expect(page.getByText("A source note is required.")).toBeVisible();
    await expect(
      page.getByText("Enter a non-negative amount with up to 2 decimals."),
    ).toBeVisible();
    await expect(page.getByText("Must be after the start date.")).toBeVisible();
    await expect(page.getByText("Enter a version.")).toBeVisible();

    await capture(page, "form-errors");
  });

  test("a duplicate version shows the 409 conflict dialog", async ({ page }) => {
    await openTariffs(page);
    await fillDuplicateRule(page);
    await page.getByRole("button", { name: "Create version" }).click();

    await expect(
      page.getByRole("heading", { name: "Tariff conflict" }),
    ).toBeVisible();
    await expect(
      page.getByText("A tariff rule with this version already exists."),
    ).toBeVisible();
    await expect(page.getByText("tariff-v2.3")).toHaveCount(2);
    await expect(page.getByText(/Request ID: req_mock_tariff/)).toBeVisible();

    await captureDialog(page, "conflict");
  });

  test("create new version opens a confirm dialog and prefills the form", async ({
    page,
  }) => {
    await openTariffs(page);

    await page
      .getByRole("button", { name: "Create new version from tariff-v2.3" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Create new version" }),
    ).toBeVisible();
    await expect(page.getByText(/The current rule stays active/)).toBeVisible();

    await captureDialog(page, "confirm-new-version");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel(/^Version/)).toHaveValue("");
    await expect(page.getByLabel(/^Valid from/)).toHaveValue("");
    await expect(page.getByLabel(/^Valid to/)).toHaveValue(
      "",
    );
    await expect(page.getByLabel(/^Source note/)).toHaveValue(
      "Synthetic demo tariff for electronics.",
    );

    await capture(page, "prefilled-form");
  });

  test("deactivate opens a confirm dialog and keeps the rule", async ({
    page,
  }) => {
    await openTariffs(page);

    await page
      .getByRole("button", { name: "Deactivate tariff-v2.3" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Deactivate tariff rule" }),
    ).toBeVisible();
    await expect(page.getByText(/there is no delete action/)).toBeVisible();

    await captureDialog(page, "confirm-deactivate");

    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    await expect(
      page.getByText("Tariff version tariff-v2.3 deactivated."),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: "tariff-v2.3", exact: true })).toBeVisible();
  });

  test("audit tab shows who, when, action, before and after", async ({
    page,
  }) => {
    await openTariffs(page);

    await page.getByRole("tab", { name: "Audit" }).click();

    await expect(
      page.getByRole("table", { name: "Audit logs" }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Actor" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Action" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Before" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "After" })).toBeVisible();
    await expect(page.getByText(/tariff_rule/).first()).toBeVisible();

    await capture(page, "audit");
  });

  test("importer gets the permission page on /admin/tariffs", async ({ page }) => {
    await authenticate(page, "importer_exporter", "/admin/tariffs");

    await expect(page.getByText("Access denied")).toBeVisible();
    await expect(
      page.getByText("You do not have permission to view this page."),
    ).toBeVisible();
    await expect(page.getByRole("table", { name: "Tariff rules" })).toHaveCount(
      0,
    );

    await capture(page, "permission");
  });
});
