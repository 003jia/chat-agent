import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const outDir = path.join(rootDir, "qa-screenshots");
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const desktop = await browser.newPage({
  viewport: { width: 1440, height: 1024 },
  deviceScaleFactor: 1
});
await desktop.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await desktop.screenshot({ path: path.join(outDir, "desktop.png"), fullPage: false });

const mobile = await browser.newPage({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  deviceScaleFactor: 1
});
await mobile.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await mobile.screenshot({ path: path.join(outDir, "mobile-chat.png"), fullPage: false });
await mobile.locator(".mobile-actions button").first().click();
await mobile.waitForTimeout(300);
await mobile.screenshot({ path: path.join(outDir, "mobile-settings.png"), fullPage: false });

await browser.close();

console.log(JSON.stringify({
  desktop: path.join(outDir, "desktop.png"),
  mobileChat: path.join(outDir, "mobile-chat.png"),
  mobileSettings: path.join(outDir, "mobile-settings.png")
}, null, 2));
