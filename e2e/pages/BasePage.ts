// BasePage：所有 POM 的基类，封装导航与通用等待。
import type { Page } from "@playwright/test";

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(path = "/") {
    await this.page.goto(path, { waitUntil: "domcontentloaded" });
  }

  // 自研弹层/抽屉：容器可见后再等内部元素，避免时序竞态
  async waitForVisible(locator: import("@playwright/test").Locator) {
    await locator.first().waitFor({ state: "visible" });
    return locator;
  }
}
