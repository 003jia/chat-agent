// 登录态 fixture：通过 /api/auth/login 换令牌并注入 sessionStorage，前置建立会话。
// 禁止读取真实 .env 令牌；令牌由 e2e-server 固定为 dev-token（与 package.json electron:dev 一致）。
import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";

type AuthFixtures = {
  loginPage: LoginPage;
};

export const test = base.extend<AuthFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  }
});

export { expect };

// 通过登录页 UI 建立会话（真实用户路径；供登录用例与需要 UI 登录的场景使用）
export async function loginViaUi(page: import("@playwright/test").Page, username: string, password: string) {
  const loginPage = new LoginPage(page);
  await loginPage.goto("/");
  await loginPage.usernameInput.fill(username);
  await loginPage.passwordInput.fill(password);
  await loginPage.submitButton.click();
}

// 通过 API 换令牌并注入 sessionStorage（供主流程用例跳过登录页）
export async function loginViaApi(page: import("@playwright/test").Page) {
  const response = await page.request.post("http://127.0.0.1:8787/api/auth/login", {
    data: { username: "admin", password: "admin123" }
  });
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json();
  await page.addInitScript((adminToken) => {
    sessionStorage.setItem("memory-agent-admin-token", adminToken);
  }, token);
}
