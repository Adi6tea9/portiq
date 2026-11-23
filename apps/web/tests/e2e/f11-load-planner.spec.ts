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

async function addCargo(page: Page, name: string, dims: [string, string, string], quantity: string) {
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Length cm/).fill(dims[0]);
  await page.getByLabel(/^Width cm/).fill(dims[1]);
  await page.getByLabel(/^Height cm/).fill(dims[2]);
  await page.getByLabel(/^Weight kg/).fill("10");
  await page.getByLabel(/^Quantity/).fill(quantity);
  await page.getByRole("button", { name: "Add cargo" }).click();
}

test.describe("F11 load planner shipment mode", () => {
  test("plans a full container from the shipment page", async ({ page }) => {
    await authenticate(page, "importer_exporter", "/shipments/ship_006");
    await page.getByRole("link", { name: "Plan this container" }).click();
    await expect(page).toHaveURL(/\/load-planner\?shipment=ship_006/);
    await expect(page.getByRole("heading", { name: /Load plan for/ })).toBeVisible();
    await expect(page.getByText("Size set by the shipment.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Auto arrange" })).toHaveCount(0);

    await addCargo(page, "Test cartons", ["60", "40", "40"], "5");
    await expect(page.getByRole("list", { name: "Cargo lines" })).toContainText("Test cartons");
    await expect(page.getByText("Cargo to load (5)")).toBeVisible();
    await expect(page.getByText("Parcels loaded").locator("..")).toContainText("5");
  });

  test("shows other shipments as grey blocks with no details", async ({ page }) => {
    await authenticate(page, "importer_exporter", "/load-planner?shipment=ship_002");
    await expect(page.getByText("Shared container", { exact: true })).toBeVisible();
    // Only the owner's line is listed; the other owners' cargo stays anonymous.
    await expect(page.getByText("Chilled cartons").first()).toBeVisible();
    await expect(page.getByText("Private pallets")).toHaveCount(0);

    await page.locator('rect[data-parcel^="o-"]').first().click({ force: true });
    await expect(page.getByText("Select a parcel in the 3D view")).toBeVisible();

    await page.locator('rect[data-parcel^="cargo_003"]').first().click({ force: true });
    await expect(page.getByText("Chilled cartons #").first()).toBeVisible();
  });

  test("offers choices when the container is full", async ({ page }) => {
    await authenticate(page, "importer_exporter", "/load-planner?shipment=ship_002");
    await addCargo(page, "Huge crates", ["200", "200", "200"], "50");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Container 1 is full/)).toBeVisible();
    await expect(dialog.getByText(/of 50 units fit/)).toBeVisible();
    await dialog.getByRole("button", { name: /here, rest .* in next container/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Container" })).toBeVisible();
  });

  test("is read only for operators", async ({ page }) => {
    await authenticate(page, "port_operator", "/load-planner?shipment=ship_001");
    await expect(page.getByRole("heading", { name: /Load plan for/ })).toBeVisible();
    await expect(page.getByText(/^Read only/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add cargo" })).toHaveCount(0);
  });

  test("keeps the labelled sample without a shipment", async ({ page }) => {
    await authenticate(page, "importer_exporter", "/load-planner");
    await expect(page.getByRole("heading", { name: "Container load planning" })).toBeVisible();
    await expect(page.getByText("Sample cargo")).toBeVisible();
  });
});
