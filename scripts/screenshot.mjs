import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = "http://127.0.0.1:5173";

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Desktop screenshot — wait for app to load
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "qa-screenshots/companion-desktop.png", fullPage: false });
  console.log("✓ companion-desktop.png saved");

  // Mobile screenshot
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await mobilePage.waitForTimeout(3000);
  await mobilePage.screenshot({ path: "qa-screenshots/companion-mobile.png", fullPage: false });
  console.log("✓ companion-mobile.png saved");

  await browser.close();
  console.log("✓ done");
})();
