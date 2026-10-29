import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.removeItem("portiq.mock.role");
    window.sessionStorage.setItem("portiq.mock.auth", "1");
  });
});

test("sandbox renders every shared component state", async ({ page }) => {
  await page.goto("/dev/sandbox");

  await expect(
    page.getByRole("heading", { name: "Component sandbox" }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic demo data").first()).toBeVisible();

  for (const label of ["Submitted", "Arrived", "Cleared", "At risk", "Forecast only"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }

  await expect(page.getByText("₹12,34,567.89").first()).toBeVisible();
  await expect(page.getByText("6.2 days").first()).toBeVisible();
  await expect(page.getByText("72%").first()).toBeVisible();
  await expect(page.getByText("18,000 kg").first()).toBeVisible();
  await expect(page.getByText("2 Nov 2026, 11:30 IST").first()).toBeVisible();

  await expect(page.getByText("No shipments", { exact: true })).toBeVisible();
  await expect(page.getByText("Access denied", { exact: true })).toBeVisible();
  await expect(
    page.getByText("The prediction service is unavailable. Try again later.").first(),
  ).toBeVisible();
});

test("role switcher changes navigation for all three roles", async ({ page }) => {
  await page.goto("/dev/sandbox");
  const primary = page.getByRole("navigation", { name: "Primary" });

  await expect(primary.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Shipments" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Capacity" })).toBeVisible();

  await page.getByTestId("role-switcher").click();
  await page.getByRole("menuitemradio", { name: "Port operator" }).click();
  await expect(primary.getByRole("link", { name: "Operator overview" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Capacity" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Dashboard" })).toHaveCount(0);

  await page.getByTestId("role-switcher").click();
  await page.getByRole("menuitemradio", { name: "Platform admin" }).click();
  await expect(primary.getByRole("link", { name: "Operator overview" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Tariffs" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Capacity" })).toHaveCount(0);
});

test("sandbox has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/dev/sandbox");
  await expect(
    page.getByRole("heading", { name: "Component sandbox" }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("shell and sandbox fit a 375px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dev/sandbox");
  await expect(
    page.getByRole("heading", { name: "Component sandbox" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("navigation", { name: "Mobile primary" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Mobile primary" })
      .getByRole("link", { name: "Shipments" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobile primary" })
    .getByRole("link", { name: "Shipments" })
    .click();
  await expect(page.getByRole("heading", { name: "Shipments" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create shipment" })).toBeVisible();

  await page.goto("/dev/sandbox");
  await expect(
    page.getByRole("heading", { name: "Component sandbox" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("captures shell screenshots in all roles", async ({ page }, testInfo) => {
  const dir = testInfo.outputPath("screenshots");
  await page.goto("/dev/sandbox");
  await expect(
    page.getByRole("heading", { name: "Component sandbox" }),
  ).toBeVisible();
  await page.screenshot({ path: `${dir}/f01-importer.png`, fullPage: true });

  await page.getByTestId("role-switcher").click();
  await page.getByRole("menuitemradio", { name: "Port operator" }).click();
  await page.screenshot({ path: `${dir}/f01-operator.png`, fullPage: true });

  await page.getByTestId("role-switcher").click();
  await page.getByRole("menuitemradio", { name: "Platform admin" }).click();
  await page.screenshot({ path: `${dir}/f01-admin.png`, fullPage: true });
});
