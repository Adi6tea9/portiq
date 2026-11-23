import { expect, test, type Page } from "@playwright/test";

const OPERATOR = {
  email: process.env.PORTIQ_LIVE_OPERATOR_EMAIL,
  password: process.env.PORTIQ_LIVE_OPERATOR_PASSWORD,
};
const ADMIN = {
  email: process.env.PORTIQ_LIVE_ADMIN_EMAIL,
  password: process.env.PORTIQ_LIVE_ADMIN_PASSWORD,
};

async function signInAsStaff(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[value="operator"]').check({ force: true });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(operator|admin)/);
}

async function expectNoLoadErrors(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/^Unable to load/)).toHaveCount(0);
}

test("port operator sees only their ports and cannot edit cargo", async ({ page }) => {
  test.skip(!OPERATOR.email || !OPERATOR.password, "Set PORTIQ_LIVE_OPERATOR_EMAIL/PASSWORD.");
  await signInAsStaff(page, OPERATOR.email!, OPERATOR.password!);

  await expect(page.getByRole("heading", { level: 1, name: "Operator overview" })).toBeVisible();
  await expect(page.getByText(/^Port scope:/)).toBeVisible();
  await expectNoLoadErrors(page);

  const firstShipment = page.getByRole("table", { name: "Operator shipments" }).getByRole("link").first();
  await firstShipment.click();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

  await page.getByRole("link", { name: "Plan this container" }).click();
  await expect(page.getByRole("button", { name: "Add cargo" })).toHaveCount(0);

  await page.goto("/admin/tariffs");
  await expect(page.getByText("Access denied")).toBeVisible();
});

test("admin sees tariffs and an audit log that names each actor", async ({ page }) => {
  test.skip(!ADMIN.email || !ADMIN.password, "Set PORTIQ_LIVE_ADMIN_EMAIL/PASSWORD.");
  await signInAsStaff(page, ADMIN.email!, ADMIN.password!);

  await page.goto("/admin/tariffs");
  await expect(page.getByRole("heading", { level: 1, name: "Tariffs" })).toBeVisible();
  await expect(page.getByRole("table").first().getByRole("row").nth(1)).toBeVisible();
  await expectNoLoadErrors(page);

  await page.getByRole("tab", { name: "Audit" }).click();
  const firstRow = page.getByRole("table").first().getByRole("row").nth(1);
  await expect(firstRow).toBeVisible();
  await expect(firstRow).not.toContainText("System");
});
