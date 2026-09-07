// 会话摘要模块 E2E（需求轨首轮验收）：生成摘要 → 面板展示 → 加入候选 → 边界/入口 → 重开回显（D-1）。
// summary.mjs 直连 callModel（不走 createApp modelClient），E2E 用 page.route mock /api/conversations/:id/summary。
import { expect, loginViaApi, test } from "../fixtures/auth";
import { ChatPage } from "../pages/ChatPage";
import { SummaryPage } from "../pages/SummaryPage";

const MOCK_SUMMARY = "E2E mock 摘要：本次对话围绕计划先行与验证习惯展开，结论是保持结构化产出。";
const MOCK_SUMMARY_V2 = "E2E mock 摘要 V2：重新生成的摘要内容。";

const DESKTOP = ".desktop-workbench";

// 统一 mock 摘要接口：默认 200 返回固定摘要；routeHandler 可覆盖（空会话 400 / 重新生成 v2）
function mockSummaryEndpoint(page: import("@playwright/test").Page, handler?: (route: import("@playwright/test").Route) => void) {
  return page.route("**/api/conversations/*/summary", async (route) => {
    if (handler) {
      await handler(route);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        summary: MOCK_SUMMARY,
        generatedAt: "2026-09-01T00:00:00.000Z",
        model: "openai-compatible/gpt-4.1-mini",
        messageCount: 30
      })
    });
  });
}

test.beforeEach(async ({ page }) => {
  await loginViaApi(page);
});

test.describe("TC-summary-001 生成摘要并显示在摘要面板", () => {
  test("生成摘要并显示在摘要面板", async ({ page }) => {
    await mockSummaryEndpoint(page);
    const chat = new ChatPage(page);
    const summary = new SummaryPage(page);
    await chat.goto("/");
    // 默认会话含种子消息，登录后进入聊天面板（composer 可见）
    await expect(chat.composerInput).toBeVisible({ timeout: 15_000 });

    await chat.sendMessage("请记住：我偏好先计划再执行。");
    await chat.expectUserMessageVisible("请记住：我偏好先计划再执行。");
    await chat.expectAssistantReplyToContain("E2E mock 回复");

    await summary.openSummaryPanel();
    await summary.expectSummaryShown(MOCK_SUMMARY);
  });
});

test.describe("TC-summary-002 摘要加入候选记忆", () => {
  test("摘要加入候选记忆", async ({ page }) => {
    await mockSummaryEndpoint(page);
    const chat = new ChatPage(page);
    const summary = new SummaryPage(page);
    await chat.goto("/");
    await expect(chat.composerInput).toBeVisible({ timeout: 15_000 });

    await chat.sendMessage("请记住：我偏好先计划再执行。");
    await chat.expectAssistantReplyToContain("E2E mock 回复");

    await summary.openSummaryPanel();
    await expect(summary.addToCandidatesButton).toBeEnabled();
    await summary.addToCandidatesButton.click();

    // 记忆抽屉打开（openPanel("memory") → .drawer-panel.right），候选区出现「新增 · 摘要」条目
    const candidateRow = page.locator(`${DESKTOP} .drawer-panel.right .candidate-row`).filter({ hasText: "摘要" }).first();
    await expect(candidateRow).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("TC-summary-003 空会话生成摘要报错不崩", () => {
  test("空会话生成摘要报错不崩", async ({ page }) => {
    // mock 后端返回 400 EMPTY_CONVERSATION，验证前端错误处理
    await mockSummaryEndpoint(page, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, code: "EMPTY_CONVERSATION", message: "对话为空，无法生成摘要。" })
      });
    });
    const chat = new ChatPage(page);
    const summary = new SummaryPage(page);
    await chat.goto("/");
    await expect(chat.composerInput).toBeVisible({ timeout: 15_000 });

    // 直接触发摘要（接口返回 400）
    await summary.generateEntry.click();

    // 页面不崩 + 出现错误提示
    await expect(page.locator(DESKTOP)).toBeVisible();
    await expect(page.locator(`${DESKTOP} .error-banner, ${DESKTOP} .status-line`).first()).toContainText("摘要生成失败", { timeout: 10_000 });
  });
});

test.describe("TC-summary-004 摘要重新生成", () => {
  test("摘要重新生成", async ({ page }) => {
    let calls = 0;
    await mockSummaryEndpoint(page, async (route) => {
      calls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          summary: calls === 1 ? MOCK_SUMMARY : MOCK_SUMMARY_V2,
          generatedAt: "2026-09-01T00:00:00.000Z",
          model: "openai-compatible/gpt-4.1-mini",
          messageCount: 30
        })
      });
    });
    const chat = new ChatPage(page);
    const summary = new SummaryPage(page);
    await chat.goto("/");
    await expect(chat.composerInput).toBeVisible({ timeout: 15_000 });

    await chat.sendMessage("请记住：我偏好先计划再执行。");
    await chat.expectAssistantReplyToContain("E2E mock 回复");

    await summary.openSummaryPanel();
    await summary.expectSummaryShown(MOCK_SUMMARY);

    await summary.regenerateButton.click();
    await summary.expectSummaryShown(MOCK_SUMMARY_V2);
  });
});

test.describe("TC-summary-005 摘要面板入口可达", () => {
  test("摘要面板入口可达", async ({ page }) => {
    await mockSummaryEndpoint(page);
    const chat = new ChatPage(page);
    const summary = new SummaryPage(page);
    await chat.goto("/");
    await expect(chat.composerInput).toBeVisible({ timeout: 15_000 });

    // 聊天区快捷操作栏存在「生成摘要」入口
    await expect(summary.generateEntry).toBeVisible();
    await summary.openSummaryPanel();
  });
});

test.describe("TC-summary-006 重开对话显示上次摘要（D-1）", () => {
  test("重开对话显示上次摘要", async ({ page }) => {
    // 已知缺陷（D-1）：generatedSummary 未从 conversation.summary 初始化，重开不显示。
    // 按应然写断言，暴露产品缺陷；不 skip，作为缺陷追踪用例。
    await mockSummaryEndpoint(page);
    const chat = new ChatPage(page);
    const summary = new SummaryPage(page);
    await chat.goto("/");
    await expect(chat.composerInput).toBeVisible({ timeout: 15_000 });

    await chat.sendMessage("请记住：我偏好先计划再执行。");
    await chat.expectAssistantReplyToContain("E2E mock 回复");
    await summary.openSummaryPanel();
    await summary.expectSummaryShown(MOCK_SUMMARY);

    // 重新加载页面后，摘要面板应显示上次摘要（PRD US-3）
    await page.reload();
    await expect(chat.composerInput).toBeVisible({ timeout: 15_000 });
    await summary.openSummaryPanel();
    await summary.expectSummaryShown(MOCK_SUMMARY);
  });
});
