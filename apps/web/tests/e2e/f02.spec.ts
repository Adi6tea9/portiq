import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const importer = {
  user_id: "user_imp_001",
  email: "importer@portiq.demo",
  display_name: "Demo Importer",
  role: "importer_exporter",
  assigned_port_ids: [],
};

async function signIn(page: Page) {
  await page.getByLabel(/Email/).fill("importer@portiq.demo");
  await page.getByLabel(/Password/).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

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

test("signs in to the role home and signs out", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await signIn(page);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
      name: "Shipments",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open profile menu" }).click();
  await expect(page.getByText("Demo Importer")).toBeVisible();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard/);
});

test("honors a safe return path after sign-in", async ({ page }) => {
  await page.goto("/shipments");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fshipments/);

  await signIn(page);

  await expect(page).toHaveURL(/\/shipments$/);
  await expect(page.getByRole("heading", { name: "Shipments" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create shipment" })).toBeVisible();
});

test("validates login and signup forms", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/signup");
  await page.getByLabel(/Email/).fill("new@portiq.demo");
  await page.getByLabel(/Password/).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Password must be at least 8 characters."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test("creates an account and completes the recovery flow", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel(/Email/).fill("new@portiq.demo");
  await page.getByLabel(/Password/).fill("long-enough");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Open profile menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/forgot-password");
  await page.getByLabel(/Email/).fill("unknown@portiq.demo");
  await page.getByRole("button", { name: "Send recovery link" }).click();
  await expect(
    page.getByText(
      "If an account exists for that email, a recovery link has been sent.",
    ),
  ).toBeVisible();

  await page.goto("/reset-password");
  await page.getByLabel(/New password/).fill("short");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByText("Password must be at least 8 characters."),
  ).toBeVisible();

  await page.getByLabel(/New password/).fill("new-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await expect(
    page.getByText("Password updated. Sign in with your new password."),
  ).toBeVisible();
});

test("shows permission states for disallowed roles", async ({ page }) => {
  await authenticate(page, "port_operator", "/dashboard");
  await expect(page.getByText("Access denied", { exact: true })).toBeVisible();
  await expect(
    page.getByText("You do not have permission to view this page."),
  ).toBeVisible();

  await authenticate(page, "platform_admin", "/shipments/ship_001");
  await expect(page.getByText("Access denied", { exact: true })).toBeVisible();
});

test("renders role-specific navigation", async ({ page }) => {
  const primary = page.getByRole("navigation", { name: "Primary" });

  await authenticate(page, "importer_exporter", "/dashboard");
  await expect(primary.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Shipments" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Capacity" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Operator overview" })).toHaveCount(0);

  await authenticate(page, "port_operator", "/operator");
  await expect(
    primary.getByRole("link", { name: "Operator overview" }),
  ).toBeVisible();
  await expect(primary.getByRole("link", { name: "Capacity" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  await expect(primary.getByRole("link", { name: "Tariffs" })).toHaveCount(0);

  await authenticate(page, "platform_admin", "/operator");
  await expect(
    primary.getByRole("link", { name: "Operator overview" }),
  ).toBeVisible();
  await expect(primary.getByRole("link", { name: "Tariffs" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Capacity" })).toHaveCount(0);
  await expect(primary.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
});

test("renders later-feature placeholders", async ({ page }) => {
  await authenticate(page, "importer_exporter", "/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Coming in F10")).toBeVisible();

  await page.goto("/shipments/new");
  await expect(page.getByRole("heading", { name: "New shipment" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create shipment" }),
  ).toBeVisible();

  await page.goto("/shipments/ship_001");
  await expect(page.getByRole("heading", { name: "Shipment detail" })).toBeVisible();
  await expect(page.getByText("Coming in F04")).toBeVisible();

  await page.goto("/shipments/ship_001/prediction/pred_001");
  await expect(
    page.getByRole("heading", { name: "Prediction result" }),
  ).toBeVisible();
  await expect(page.getByText("Coming in F05")).toBeVisible();
});

test.describe("API 401 handling", () => {
  test.use({ serviceWorkers: "block" });

  test("redirects to login and returns to the requested page", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      window.sessionStorage.setItem("portiq.mock.auth", "1");
    });

    let meCalls = 0;
    await page.route("**/api/v1/me", async (route) => {
      meCalls += 1;

      if (meCalls === 1) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "UNAUTHENTICATED",
              message: "Authentication required.",
              request_id: "req_401",
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: importer,
          meta: { request_id: "req_200" },
        }),
      });
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard/);

    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(meCalls).toBeGreaterThanOrEqual(2);
  });
});

test("auth and protected pages have no WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  let results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await authenticate(page, "importer_exporter", "/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("captures F02 screenshots", async ({ page }, testInfo) => {
  const dir = testInfo.outputPath("screenshots");

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.screenshot({ path: `${dir}/f02-login.png`, fullPage: true });

  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await page.screenshot({
    path: `${dir}/f02-login-validation.png`,
    fullPage: true,
  });

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await page.screenshot({ path: `${dir}/f02-signup.png`, fullPage: true });

  await page.getByLabel(/Email/).fill("new@portiq.demo");
  await page.getByLabel(/Password/).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Password must be at least 8 characters."),
  ).toBeVisible();
  await page.screenshot({
    path: `${dir}/f02-signup-validation.png`,
    fullPage: true,
  });

  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();
  await page.screenshot({
    path: `${dir}/f02-forgot-password.png`,
    fullPage: true,
  });

  await page.goto("/reset-password");
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page.screenshot({
    path: `${dir}/f02-reset-password.png`,
    fullPage: true,
  });

  await authenticate(page, "port_operator", "/dashboard");
  await expect(page.getByText("Access denied", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${dir}/f02-permission.png`, fullPage: true });

  await page.goto("/settings");
  await expect(page.getByText("Coming in F10")).toBeVisible();
  await page.screenshot({ path: `${dir}/f02-coming-soon.png`, fullPage: true });

  await page.goto("/operator");
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
      name: "Operator overview",
    }),
  ).toBeVisible();
  await page.screenshot({ path: `${dir}/f02-operator-nav.png`, fullPage: true });
});
