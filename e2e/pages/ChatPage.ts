// ChatPage：聊天主界面（欢迎屏 + 聊天面板）POM。
// 稳定语义：placeholder 定位 composer 输入框；aria-label=发送 定位发送按钮；
// message-row 分 user/assistant，正文落在 .bubble.markdown-body。
import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

const COMPOSER_PLACEHOLDER = "发消息，或让智能体记住一件事...";
// 页面同时渲染桌面端 .desktop-workbench 与移动端 .mobile-shell，锚点统一限定桌面端
const DESKTOP = ".desktop-workbench";

export class ChatPage extends BasePage {
  readonly composerInput: Locator;
  readonly sendButton: Locator;
  readonly chatPanel: Locator;

  constructor(page: Page) {
    super(page);
    this.composerInput = page.locator(`${DESKTOP} input[placeholder="${COMPOSER_PLACEHOLDER}"]`).first();
    this.sendButton = page.locator(DESKTOP).getByRole("button", { name: "发送" }).first();
    this.chatPanel = page.locator(`${DESKTOP} .chat-panel`).first();
  }

  async sendMessage(content: string) {
    await this.composerInput.fill(content);
    await this.sendButton.click();
  }

  // 等待某条消息气泡出现并包含目标文本（终态 UI 断言，不等中间态）
  async expectAssistantReplyToContain(text: string) {
    const assistantBubble = this.page.locator(`${DESKTOP} .message-row.assistant .bubble.markdown-body`).last();
    await expect(assistantBubble).toContainText(text, { timeout: 15_000 });
  }

  async expectUserMessageVisible(content: string) {
    const userBubble = this.page.locator(`${DESKTOP} .message-row.user .bubble.markdown-body`).last();
    await expect(userBubble).toContainText(content);
  }
}
