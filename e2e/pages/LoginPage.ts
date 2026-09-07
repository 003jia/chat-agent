// LoginPage：本地访问登录页（AccessSetup）。
// 稳定语义：表单 role=alert 错误提示、placeholder 文案定位输入框。
import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.locator('input[placeholder="请输入账号"]');
    this.passwordInput = page.locator('input[placeholder="请输入密码"]');
    this.submitButton = page.getByRole("button", { name: "登录并进入" });
    this.errorAlert = page.locator('.access-setup-error[role="alert"]');
  }

  // 登录后应离开登录页进入工作台（桌面端主容器；页面同时渲染 mobile 副本，锚点须唯一）
  async expectEnteredWorkbench() {
    await expect(this.page.locator(".desktop-workbench")).toBeVisible({ timeout: 15_000 });
  }
}
