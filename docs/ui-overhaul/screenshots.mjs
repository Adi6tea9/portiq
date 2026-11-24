// Captures every app route per role at desktop, tablet and mobile sizes.
// Usage (from apps/web, mock server on :3100): node ../../docs/ui-overhaul/screenshots.mjs before|after [filter]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(join(process.cwd(), "package.json"))("@playwright/test");
const phase = process.argv[2] ?? "after";
const filter = process.argv[3] ?? "";
const base = process.env.BASE_URL ?? "http://localhost:3100";
const outDir = join(dirname(fileURLToPath(import.meta.url)), phase);
mkdirSync(outDir, { recursive: true });

const SIZES = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
};

const ROUTES = {
  importer_exporter: [
    "/dashboard",
    "/shipments",
    "/shipments/new",
    "/shipments/ship_001",
    "/shipments/ship_001/edit",
    "/shipments/ship_001/prediction/pred_001",
    "/predictions",
    "/capacity",
    "/load-planner",
    "/load-planner?shipment=ship_001",
    "/settings",
  ],
  port_operator: [
    "/operator",
    "/shipments/ship_001",
    "/shipments/ship_001/prediction/pred_001",
    "/predictions",
    "/capacity",
    "/load-planner",
    "/settings",
  ],
  platform_admin: ["/operator", "/admin/tariffs", "/capacity", "/load-planner", "/settings"],
};

const browser = await chromium.launch({ channel: "chrome" });
const failures = [];

for (const [role, routes] of Object.entries(ROUTES)) {
  for (const [sizeName, viewport] of Object.entries(SIZES)) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await page.evaluate((nextRole) => {
      sessionStorage.setItem("portiq.mock.auth", "1");
      localStorage.setItem("portiq.mock.role", nextRole);
    }, role);

    for (const route of routes) {
      const slug = route.replace(/^\//, "").replace(/[/?=]/g, "_") || "root";
      const name = `${role}__${slug}__${sizeName}`;
      if (filter && !name.includes(filter)) continue;
      try {
        await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 90_000 });
        await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(800);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 0) failures.push(`${name}: horizontal overflow ${overflow}px`);
        await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
      } catch (error) {
        failures.push(`${name}: ${error.message.split("\n")[0]}`);
        await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true }).catch(() => {});
      }
    }
    await context.close();
  }
}

await browser.close();
console.log(failures.length ? failures.join("\n") : "no failures");
