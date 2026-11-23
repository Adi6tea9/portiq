import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.PORTIQ_LIVE_EMAIL;
const PASSWORD = process.env.PORTIQ_LIVE_PASSWORD;

test.skip(!EMAIL || !PASSWORD, "Set PORTIQ_LIVE_EMAIL and PORTIQ_LIVE_PASSWORD to run live tests.");

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL!);
  await page.getByLabel(/^Password/).fill(PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

async function expectNoLoadErrors(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/^Unable to load/)).toHaveCount(0);
}

function arrivalInDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return `${date.toISOString().slice(0, 10)}T10:00`;
}

test("importer signs in, creates a shipment, predicts it and plans its container", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expectNoLoadErrors(page);

  // Each run leaves one shipment on the test account; the reference keeps runs apart.
  const reference = `LIVE-E2E-${Date.now().toString(36).toUpperCase()}`;
  await page.goto("/shipments/new");
  const nhavaSheva = page.getByRole("option", { name: /INNSA/ });
  await expect(nhavaSheva).toBeAttached();
  await page
    .getByRole("combobox", { name: /^Port/ })
    .selectOption((await nhavaSheva.getAttribute("value")) ?? "");
  await page.getByLabel(/^Reference/).fill(reference);
  await page.getByRole("combobox", { name: /^Direction/ }).selectOption("import");
  await page.getByRole("combobox", { name: /^Cargo type/ }).selectOption("general_container");
  await page.getByRole("combobox", { name: /^Container size/ }).selectOption("20");
  await page.getByLabel(/^HS code/).fill("850440");
  await page.getByLabel(/^Weight/).fill("4000");
  await page.getByLabel(/^Declared value/).fill("150000.00");
  await page.getByRole("combobox", { name: /^Shipping line/ }).selectOption("Line A");
  await page.getByRole("combobox", { name: /^Vessel size band/ }).selectOption("large");
  await page.getByLabel(/^Expected arrival/).fill(arrivalInDays(10));
  await page.getByRole("combobox", { name: /^Documentation status/ }).selectOption("complete");
  await page.getByRole("button", { name: "Create shipment" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText(reference);
  const shipmentUrl = page.url();

  await page.getByRole("button", { name: "Run prediction" }).click();
  await page.waitForURL(/\/prediction\//);
  await expect(page.getByText(/^Estimated dwell time: \d+\.\d days$/)).toBeVisible();

  await page.goto(shipmentUrl);
  await page.getByRole("link", { name: "Plan this container" }).click();
  await expect(page.getByText("Size set by the shipment.")).toBeVisible();
  await page.getByLabel(/^Name/).fill("Live cartons");
  await page.getByLabel(/^Length cm/).fill("60");
  await page.getByLabel(/^Width cm/).fill("40");
  await page.getByLabel(/^Height cm/).fill("40");
  await page.getByLabel(/^Weight kg/).fill("12");
  await page.getByLabel(/^Quantity/).fill("6");
  await page.getByRole("button", { name: "Add cargo" }).click();
  await expect(page.getByText("Parcels loaded").locator("..")).toContainText("6");
});

test("importer screens load against the live API", async ({ page }) => {
  await signIn(page);

  for (const [path, heading] of [
    ["/shipments", "Shipments"],
    ["/capacity", /Capacity/],
    ["/load-planner", "Container load planning"],
    ["/settings", "Settings"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading }).first()).toBeVisible();
    await expectNoLoadErrors(page);
  }

  await page.goto("/admin/tariffs");
  await expect(page.getByText("Access denied")).toBeVisible();
});
