import { chromium } from "playwright";
import fs from "fs";

const OUT = "/home/user/afrigen/shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4200";
const PASS = "afrigen2026";

const roles = {
  client:   { email: "client@afrigen.africa",   tabs: [["pipeline","/app"],["new","/app/new"],["cargo","/app/cargo"]] },
  supplier: { email: "supplier@afrigen.africa", tabs: [["fleet","/app"],["vault","/app/vault"],["breakdown","/app/breakdown"],["cargobids","/app/cargo"]] },
  field:    { email: "field@afrigen.africa",    tabs: [["audits","/app"],["border","/app/border"]] },
  admin:    { email: "admin@afrigen.africa",    tabs: [["overview","/app"],["verify","/app/verify"],["ledger","/app/ledger"]] },
};

async function login(page, email) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: "networkidle" });
  // ensure signin mode
  const signinBtn = page.getByRole("button", { name: "Sign in" }).first();
  await signinBtn.click().catch(() => {});
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASS);
  await page.getByRole("button", { name: /Sign in/i }).last().click();
  await page.waitForTimeout(2500);
}

const wait = (p, ms = 1600) => p.waitForTimeout(ms);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

// 1. Auth screen (clean, before login)
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await wait(page);
await page.screenshot({ path: `${OUT}/00-auth.png` });
console.log("shot 00-auth");

for (const [role, cfg] of Object.entries(roles)) {
  await login(page, cfg.email);
  for (const [name, href] of cfg.tabs) {
    await page.goto(BASE + href, { waitUntil: "networkidle" });
    await wait(page);
    const file = `${role}-${name}.png`;
    await page.screenshot({ path: `${OUT}/${file}` });
    console.log("shot", file);
  }
  // client: capture a contract detail (the active cross-border hero contract)
  if (role === "client") {
    await page.goto(BASE + "/app", { waitUntil: "networkidle" });
    await wait(page);
    const link = page.getByText(/Open|View|Details/i).first();
    if (await link.count()) {
      await link.click().catch(() => {});
      await wait(page, 2000);
      await page.screenshot({ path: `${OUT}/client-contract.png` });
      console.log("shot client-contract");
    }
  }
}

await browser.close();
console.log("DONE");
