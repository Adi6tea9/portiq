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
      await expect(
        page.getByText("Estimated dwell time: 6.2 days"),
      ).toBeVisible();
      await expect(page.getByText("₹2,85,700.00")).toBeVisible();
      await expect(page.getByText("Customs duty")).toBeVisible();
      await expect(page.getByText("72%")).toBeVisible();
      await expect(page.getByText("(Moderate utilization)")).toBeVisible();
      await expect(
        page.getByRole("img", { name: /diverging bar chart/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "What it means" }),
      ).toBeVisible();
      await expect(page.getByText("Base value: 5.0 days")).toBeVisible();
      await expect(
        page.getByText("These are model effects, not proof of cause."),
      ).toBeVisible();
      await expect(
        page.getByText("Synthetic demo data").first(),
      ).toBeVisible();
      await expect(page.getByText(/Forecast generated at/)).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Back to shipment" }),
      ).toHaveAttribute("href", "/shipments/ship_001");
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
      await expect(page.getByText("(Moderate utilization)")).toHaveCount(0);
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
        `/shipments/${fixture.shipmentId}/prediction/${fixture.predictionId}`,
      );

      await expect(
        page.getByRole("heading", { name: "Prediction result" }),
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

    await page.waitForURL(/\/shipments\/ship_006\/prediction\/pred_/);
    await expect(
      page.getByRole("heading", { name: "Prediction result" }),
    ).toBeVisible();
    await expect(
      page.getByText(/^Estimated dwell time: \d+\.\d days$/),
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
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

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
