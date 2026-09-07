// 聊天模块 E2E：发消息 → 流式回复终态断言（model 走 e2e-server mock，不打真实模型 API）。
import { expect, loginViaApi, test } from "../fixtures/auth";
import { ChatPage } from "../pages/ChatPage";

const MOCK_REPLY = "E2E mock 回复：流式增量。";

test.beforeEach(async ({ page }) => {
  await loginViaApi(page);
});

test.describe("TC-chat-001 发送消息并收到流式回复", () => {
  test("发送消息并收到流式回复", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto("/");
    // 空会话先见欢迎屏 composer
    await expect(chat.composerInput).toBeVisible({ timeout: 15_000 });

    await chat.sendMessage("请记住：我偏好先计划再执行。");
    await chat.expectUserMessageVisible("请记住：我偏好先计划再执行。");
    await chat.expectAssistantReplyToContain(MOCK_REPLY);
  });
});

test.describe("TC-chat-002 助手消息可复制", () => {
  test("助手消息可复制", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.goto("/");
    await expect(chat.composerInput).toBeVisible({ timeout: 15_000 });

    await chat.sendMessage("请记住：我偏好先计划再执行。");
    await chat.expectAssistantReplyToContain(MOCK_REPLY);

    // 复制按钮在助手消息操作区（aria-label 复制，限定桌面端）；message-actions 默认 opacity:0，
    // 需先 hover 消息行使其可见；复制成功后底部状态栏提示「已复制」
    const assistantRow = page.locator('.desktop-workbench .message-row.assistant').last();
    await assistantRow.hover();
    const copyButton = page.locator('.desktop-workbench .message-row.assistant .message-actions button[aria-label="复制"]').last();
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(page.locator(".desktop-workbench .status-line").first()).toContainText("已复制", { timeout: 5_000 });
  });
});
