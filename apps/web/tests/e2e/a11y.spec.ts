import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

type Role = "importer_exporter" | "port_operator" | "platform_admin";

interface PageUnderTest {
  path: string;
  name: string;
  role: Role | null;
  ready: (page: Page) => Promise<void>;
}

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Serial: a cold Next dev server compiles each route on first visit, which
// would exceed the default expect timeout when many unfamiliar routes are
// requested at once.
test.describe.configure({ mode: "serial" });

async function authenticate(page: Page, role: Role, path: string) {
  await page.goto("/login");
  await page.evaluate((nextRole) => {
    window.sessionStorage.setItem("portiq.mock.auth", "1");
    window.localStorage.setItem("portiq.mock.role", nextRole);
  }, role);
  await page.goto(path);
}

async function waitForHeading(page: Page, name: string | RegExp) {
  await expect(
    page.getByRole("heading", { name, level: 1 }),
  ).toBeVisible({ timeout: 30_000 });
}

const PAGES: PageUnderTest[] = [
  {
    path: "/",
    name: "landing",
    role: null,
    ready: async (page) => waitForHeading(page, "Predict. Plan. Ship."),
  },
  {
    path: "/login",
    name: "login",
    role: null,
    ready: async (page) => waitForHeading(page, "Sign in"),
  },
  {
    path: "/signup",
    name: "signup",
    role: null,
    ready: async (page) => waitForHeading(page, "Create account"),
  },
  {
    path: "/forgot-password",
    name: "forgot-password",
    role: null,
    ready: async (page) => waitForHeading(page, "Reset your password"),
  },
  {
    path: "/reset-password",
    name: "reset-password",
    role: null,
    ready: async (page) => waitForHeading(page, "Choose a new password"),
  },
  {
    path: "/dashboard",
    name: "dashboard",
    role: "importer_exporter",
    ready: async (page) => waitForHeading(page, "Dashboard"),
  },
  {
    path: "/shipments",
    name: "shipments list",
    role: "importer_exporter",
    ready: async (page) => waitForHeading(page, "Shipments"),
  },
  {
    path: "/shipments/new",
    name: "new shipment",
    role: "importer_exporter",
    ready: async (page) => waitForHeading(page, "New shipment"),
  },
  {
    path: "/shipments/ship_001",
    name: "shipment detail",
    role: "importer_exporter",
    ready: async (page) => waitForHeading(page, "SHIP-2026-001"),
  },
  {
    path: "/shipments/ship_001/edit",
    name: "edit shipment",
    role: "importer_exporter",
    ready: async (page) => waitForHeading(page, "Edit shipment"),
  },
  {
    path: "/shipments/ship_001/prediction/pred_001",
    name: "prediction result",
    role: "importer_exporter",
    ready: async (page) => waitForHeading(page, "Prediction result"),
  },
  {
    path: "/capacity",
    name: "capacity",
    role: "importer_exporter",
    ready: async (page) => waitForHeading(page, "Capacity forecast"),
  },
  {
    path: "/operator",
    name: "operator overview",
    role: "port_operator",
    ready: async (page) => waitForHeading(page, "Operator overview"),
  },
  {
    path: "/capacity",
    name: "capacity (operator)",
    role: "port_operator",
    ready: async (page) => waitForHeading(page, "Capacity forecast"),
  },
  {
    path: "/admin/tariffs",
    name: "admin tariffs",
    role: "platform_admin",
    ready: async (page) => {
      await waitForHeading(page, "Tariffs");
      await expect(
        page.getByRole("table", { name: "Tariff rules" }),
      ).toBeVisible();
    },
  },
  {
    path: "/admin/tariffs",
    name: "admin tariffs audit",
    role: "platform_admin",
    ready: async (page) => {
      await waitForHeading(page, "Tariffs");
      await page.getByRole("tab", { name: "Audit" }).click();
      await expect(page.getByRole("table", { name: "Audit logs" })).toBeVisible();
    },
  },
  {
    path: "/settings",
    name: "settings",
    role: "importer_exporter",
    ready: async (page) => waitForHeading(page, "Settings"),
  },
  {
    path: "/dev/sandbox",
    name: "component sandbox",
    role: "platform_admin",
    ready: async (page) => waitForHeading(page, "Component sandbox"),
  },
];

for (const pageUnderTest of PAGES) {
  test(`${pageUnderTest.name} has no serious accessibility violations`, async ({
    page,
  }) => {
    test.setTimeout(90_000);

    if (pageUnderTest.role) {
      await authenticate(page, pageUnderTest.role, pageUnderTest.path);
    } else {
      await page.goto(pageUnderTest.path);
    }

    await pageUnderTest.ready(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const serious = results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );

    expect(
      serious.map(
        (violation) =>
          `${pageUnderTest.path} ${violation.id} (${violation.impact}): ${violation.nodes.length} node(s) — ${violation.help}`,
      ),
    ).toEqual([]);
  });
}
