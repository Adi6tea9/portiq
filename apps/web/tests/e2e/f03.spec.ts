import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.sessionStorage.setItem("portiq.mock.auth", "1");
    window.localStorage.setItem("portiq.mock.role", "importer_exporter");
  });
});

async function waitForPorts(page: Page) {
  await expect(page.getByRole("option", { name: /INNSA/ })).toBeAttached();
}

async function fillShipmentForm(
  page: Page,
  options: { weight?: string; hsCode?: string } = {},
) {
  await waitForPorts(page);
  await page
    .getByRole("combobox", { name: /^Port/ })
    .selectOption("port_nsa");
  await page.getByLabel(/^Reference/).fill("SHIP-2026-100");
  await page
    .getByRole("combobox", { name: /^Direction/ })
    .selectOption("import");
  await page
    .getByRole("combobox", { name: /^Cargo type/ })
    .selectOption("general_container");
  await page
    .getByRole("combobox", { name: /^Container size/ })
    .selectOption("40");
  await page.getByLabel(/^HS code/).fill(options.hsCode ?? "850440");
  await page.getByLabel(/^Weight/).fill(options.weight ?? "18000");
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

test("creates a shipment and lands on the detail placeholder", async ({
  page,
}) => {
  await page.goto("/shipments/new");
  await expect(page.getByRole("heading", { name: "New shipment" })).toBeVisible();

  await fillShipmentForm(page);
  await page.getByRole("button", { name: "Create shipment" }).click();

  await expect(page).toHaveURL(/\/shipments\/ship_[a-z0-9]+$/);
  await expect(
    page.getByRole("heading", { name: "Shipment detail" }),
  ).toBeVisible();
  await expect(page.getByText("Coming in F04")).toBeVisible();
});

test("shows client validation errors and keeps the entered values", async ({
  page,
}, testInfo) => {
  const dir = testInfo.outputPath("screenshots");

  await page.goto("/shipments/new");
  await expect(page.getByRole("heading", { name: "New shipment" })).toBeVisible();
  await expect(page.getByRole("option", { name: /INNSA/ })).toBeAttached();
  await page.screenshot({ path: `${dir}/f03-form.png`, fullPage: true });

  await fillShipmentForm(page, { weight: "0", hsCode: "85044" });
  await page.getByRole("button", { name: "Create shipment" }).click();

  await expect(page.getByText("Weight must be greater than 0.")).toBeVisible();
  await expect(page.getByText("Enter a 6-digit HS code.")).toBeVisible();
  await expect(page.getByLabel(/^Weight/)).toHaveValue("0");
  await expect(page.getByLabel(/^HS code/)).toHaveValue("85044");
  await page.screenshot({
    path: `${dir}/f03-form-validation.png`,
    fullPage: true,
  });
});

test("maps a mocked 422 to the weight field", async ({ page }, testInfo) => {
  const dir = testInfo.outputPath("screenshots");

  await page.goto("/shipments/new?mock_error=422");
  await expect(page.getByRole("heading", { name: "New shipment" })).toBeVisible();

  await fillShipmentForm(page);
  await page.getByRole("button", { name: "Create shipment" }).click();

  await expect(page.getByText("Must be greater than 0.")).toBeVisible();
  await expect(page.getByText("Request ID: req_mock_422")).toBeVisible();
  await expect(page.getByLabel(/^Weight/)).toHaveValue("18000");
  await page.screenshot({ path: `${dir}/f03-form-422.png`, fullPage: true });
});

test("lists, paginates, and filters shipments", async ({ page }, testInfo) => {
  const dir = testInfo.outputPath("screenshots");

  await page.goto("/shipments");
  await expect(page.getByRole("heading", { name: "Shipments" })).toBeVisible();
  await expect(page.getByText("SHIP-2026-001")).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(page.getByText(/Showing 1–10 of 12/)).toBeVisible();
  await page.screenshot({ path: `${dir}/f03-list.png`, fullPage: true });

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("SHIP-2026-011")).toBeVisible();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Previous" }).click();
  await page
    .getByRole("combobox", { name: /^Status/ })
    .selectOption("arrived");
  await expect(page.getByText("SHIP-2026-001")).toHaveCount(0);
  await expect(page.getByText("SHIP-2026-003")).toBeVisible();
  await expect(page.getByText("SHIP-2026-004")).toBeVisible();
  await expect(page.getByText("SHIP-2026-008")).toBeVisible();
  await expect(
    page.getByRole("row", { name: /SHIP-2026-004/ }).getByText("Not predicted yet"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel(/^Reference/).fill("SHIP-2026-012");
  await expect(page.getByText("SHIP-2026-012")).toBeVisible();
  await expect(page.getByText("SHIP-2026-003")).toHaveCount(0);
});

test("shows the empty and 503 states", async ({ page }, testInfo) => {
  const dir = testInfo.outputPath("screenshots");

  await page.goto("/shipments");
  await expect(page.getByText("SHIP-2026-001")).toBeVisible();
  await page.getByLabel(/^Reference/).fill("NO-MATCH");
  await expect(page.getByText("No shipments yet.")).toBeVisible();
  await expect(
    page.getByText("Create your first shipment to get an estimate."),
  ).toBeVisible();
  await page.screenshot({ path: `${dir}/f03-empty.png`, fullPage: true });

  await page.goto("/shipments?mock_error=503");
  await expect(
    page.getByText("The prediction service is unavailable. Try again later."),
  ).toBeVisible();
  await expect(page.getByText("Request ID: req_mock_503")).toBeVisible();
  await page.screenshot({ path: `${dir}/f03-error-503.png`, fullPage: true });
});

test("F03 pages have no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/shipments/new");
  await expect(page.getByRole("heading", { name: "New shipment" })).toBeVisible();
  await waitForPorts(page);

  let results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.goto("/shipments");
  await expect(page.getByText("SHIP-2026-001")).toBeVisible();

  results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
