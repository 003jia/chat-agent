// SummaryPage：会话摘要面板 POM。
// SummaryPanel 渲染在 InteractionPanel 的 .drawer 容器（role=dialog）；记忆抽屉是 .drawer-panel.right。
// 稳定语义：quick-actions 内「生成摘要」入口、摘要面板「重新生成」「加入候选记忆」按钮、
// .markdown-preview 摘要正文、.candidate-row 候选区。
import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

const DESKTOP = ".desktop-workbench";
const SUMMARY_DRAWER = `${DESKTOP} .overlay[role="dialog"] .drawer`;

export class SummaryPage extends BasePage {
  readonly generateEntry: Locator; // 聊天区快捷操作「生成摘要」
  readonly regenerateButton: Locator; // 摘要面板「重新生成」
  readonly addToCandidatesButton: Locator; // 摘要面板「加入候选记忆」
  readonly markdownPreview: Locator; // 摘要正文
  readonly summaryPanel: Locator; // 摘要抽屉容器

  constructor(page: Page) {
    super(page);
    this.generateEntry = page.locator(`${DESKTOP} .quick-actions button`).filter({ hasText: "生成摘要" }).first();
    this.regenerateButton = page.locator(`${SUMMARY_DRAWER} button`).filter({ hasText: "重新生成" }).first();
    this.addToCandidatesButton = page.locator(`${SUMMARY_DRAWER} button`).filter({ hasText: "加入候选记忆" }).first();
    this.markdownPreview = page.locator(`${SUMMARY_DRAWER} .markdown-preview`).first();
    this.summaryPanel = page.locator(SUMMARY_DRAWER).filter({ hasText: "重新生成" }).first();
  }

  async openSummaryPanel() {
    await this.generateEntry.click();
    await expect(this.summaryPanel).toBeVisible({ timeout: 10_000 });
  }

  async expectSummaryShown(text: string) {
    await expect(this.markdownPreview).toContainText(text, { timeout: 10_000 });
  }
}
