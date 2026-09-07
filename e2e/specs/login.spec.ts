// 登录模块 E2E：错误凭证 → 错误提示；正确凭证 → 进入工作台。
import { expect, loginViaUi, test } from "../fixtures/auth";

test.describe("TC-login-001 错误凭证登录提示", () => {
  test("错误凭证登录提示", async ({ page, loginPage }) => {
    await loginPage.goto("/");
    await loginPage.usernameInput.fill("admin");
    await loginPage.passwordInput.fill("wrong-password");
    await loginPage.submitButton.click();

    await expect(loginPage.errorAlert).toBeVisible({ timeout: 10_000 });
    await expect(loginPage.errorAlert).toContainText("账号或密码不正确");
  });
});

test.describe("TC-login-002 正确凭证进入工作台", () => {
  test("正确凭证进入工作台", async ({ page, loginPage }) => {
    await loginViaUi(page, "admin", "admin123");
    await loginPage.expectEnteredWorkbench();
  });
});
