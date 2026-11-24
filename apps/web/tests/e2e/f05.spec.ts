import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', "test@example.com");
  await page.fill('input[type="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("/dashboard");
}

const FIXTURES = [
  {
    name: "full",
    shipmentId: "ship_001",
    predictionId: "pred_001",
    assert: async (page: Page) => {
      const summary = page.getByRole("region", { name: "Prediction summary" });
      await expect(summary.getByText("Estimated dwell time")).toBeVisible();
      await expect(summary.getByText("6.2 days")).toBeVisible();
      await expect(summary.getByText("₹2,85,700.00")).toBeVisible();
      await expect(page.getByText("Customs duty", { exact: true })).toBeVisible();
      await expect(page.getByText("72%", { exact: true })).toBeVisible();
      await expect(page.getByText("(Moderate utilization)", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("img", { name: /diverging bar chart/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "What it means" }),
      ).toBeVisible();
      await expect(page.getByText("Base value: 5.0 days", { exact: true })).toBeVisible();
      await expect(
        page.getByText("These are model effects, not proof of cause.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Synthetic demo data").first(),
      ).toBeVisible();
      await expect(page.getByText(/Forecast generated at/)).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Back to Predictions" }),
      ).toHaveAttribute("href", "/predictions");
      await expect(
        page.getByRole("link", { name: "SHIP-2026-001" }),
      ).toHaveAttribute("href", "/shipments/ship_001");
      await expect(
        page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: /Predictions/ }),
      ).toHaveAttribute("aria-current", "page");
    },
  },
  {
    name: "partial-cost",
    shipmentId: "ship_002",
    predictionId: "pred_002",
    assert: async (page: Page) => {
      await expect(
        page.getByText(
          "No demurrage rule found for shipping line Line B and cargo type reefer.",
        ),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Indicative total. Some components could not be calculated.",
        ),
      ).toBeVisible();
      await expect(page.getByText("Unavailable").first()).toBeVisible();
    },
  },
  {
    name: "explanation-unavailable",
    shipmentId: "ship_003",
    predictionId: "pred_003",
    assert: async (page: Page) => {
      await expect(
        page.getByText(
          "The SHAP explainer is unavailable for this prediction because of a model version mismatch.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("img", { name: /diverging bar chart/i }),
      ).toHaveCount(0);
      await expect(page.getByText("Feature contributions (days)")).toHaveCount(
        0,
      );
    },
  },
  {
    name: "capacity-unavailable",
    shipmentId: "ship_007",
    predictionId: "pred_007",
    assert: async (page: Page) => {
      await expect(
        page.getByText(
          "Capacity forecast is not available for the requested arrival date range.",
        ),
      ).toBeVisible();
      await expect(page.getByText(/%/)).toHaveCount(0);
      await expect(page.getByText("(Moderate utilization)", { exact: true })).toHaveCount(0);
    },
  },
  {
    name: "all-unavailable",
    shipmentId: "ship_012",
    predictionId: "pred_012",
    assert: async (page: Page) => {
      await expect(page.getByText(/0\.00/)).toHaveCount(0);
      await expect(page.getByText("Unavailable").first()).toBeVisible();
      await expect(
        page.getByText("No active customs duty rule matches this shipment."),
      ).toBeVisible();
    },
  },
];

test.describe("F05 - Run prediction and result page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const fixture of FIXTURES) {
    test(`prediction fixture: ${fixture.name}`, async ({ page }) => {
      await page.goto(
        `/predictions/${fixture.shipmentId}/${fixture.predictionId}`,
      );

      await expect(
        page.getByRole("heading", { name: "Prediction results" }),
      ).toBeVisible();

      await fixture.assert(page);

      // Wait for the last block (footer disclaimer) and the chart paint before
      // capturing, so fullPage never races a partially rendered page.
      await expect(
        page.getByText(/PortIQ provides planning estimates/).last(),
      ).toBeVisible();
      await expect(page.locator("main")).not.toBeEmpty();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);

      await page.screenshot({
        path: `test-results/f05-${fixture.name}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });
  }

  test("importer runs a prediction and lands on the result page", async ({
    page,
  }) => {
    await page.goto("/shipments/ship_006");

    const runButton = page.getByRole("button", { name: "Run prediction" });
    await expect(runButton).toBeEnabled();
    await runButton.click();
    await page.waitForURL(/\/predictions\/ship_006\/run\?key=/);
    await expect(
      page.getByRole("heading", { name: "Running prediction" }),
    ).toBeVisible();

    await page.waitForURL(/\/predictions\/ship_006\/pred_/);
    await expect(
      page.getByRole("heading", { name: "Prediction results" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Prediction summary" })
        .getByText(/^\d+\.\d days$/),
    ).toBeVisible();
    await expect(
      page.getByText(/PortIQ provides planning estimates/).last(),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "test-results/f05-run-success.png",
      fullPage: true,
      animations: "disabled",
    });
  });

  test("run shows the 503 model-unavailable state", async ({ page }) => {
    await page.goto("/shipments/ship_006?mock_run_error=503");

    await page.getByRole("button", { name: "Run prediction" }).click();

    await expect(
      page.getByText(
        "The prediction service is unavailable. Try again later.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry prediction" })).toBeVisible();

    await page.screenshot({
      path: "test-results/f05-run-503.png",
      fullPage: true,
    });
  });

  test("run shows the 429 rate-limited state", async ({ page }) => {
    await page.goto("/shipments/ship_006?mock_run_error=429");

    await page.getByRole("button", { name: "Run prediction" }).click();

    await expect(
      page.getByText("Too many requests. Please wait and try again."),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/f05-run-429.png",
      fullPage: true,
    });
  });
});
