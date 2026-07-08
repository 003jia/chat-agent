import { CheckCircle2, ClipboardList, Database, FileText, Globe2, Loader2, Mic, Paperclip, Search, Send, X } from "lucide-react";
import { FormEvent, useState } from "react";
import type { WorkbenchProps, ActivePanel } from "../workbenchTypes";
import { AgentEditorPanel, SettingsPanel } from "./SettingsPanels";
import { MemoryDetailPanel } from "./MemoryPanel";
import { humanizeMemoryType } from "./ui";

export function InteractionPanel(props: WorkbenchProps) {
  const { renderedPanel, panelPhase, closePanel } = props;
  if (!renderedPanel) return null;

  const titles: Record<Exclude<ActivePanel, null>, string> = {
    search: "搜索工作区",
    settings: "设置",
    memory: "memory.md",
    tools: "工具",
    summary: "会话摘要",
    agent: "智能体身份",
    webSearch: "联网搜索"
  };

  return (
    <div className={`overlay ${panelPhase}`} role="dialog" aria-modal="true" aria-label={titles[renderedPanel]} onMouseDown={(event) => {
      if (event.target === event.currentTarget) closePanel();
    }}>
      <div className={`drawer ${panelPhase}`}>
        <header className="drawer-head">
          <div>
            <span>记忆工作台</span>
            <h2>{titles[renderedPanel]}</h2>
          </div>
          <button type="button" onClick={closePanel} aria-label="关闭"><X size={20} /></button>
        </header>
        {renderedPanel === "search" && <SearchPanel {...props} />}
        {renderedPanel === "settings" && <SettingsPanel {...props} />}
        {renderedPanel === "memory" && <MemoryDetailPanel {...props} />}
        {renderedPanel === "tools" && <ToolsPanel {...props} />}
        {renderedPanel === "summary" && <SummaryPanel {...props} />}
        {renderedPanel === "agent" && <AgentEditorPanel {...props} />}
        {renderedPanel === "webSearch" && <WebSearchPanel {...props} />}
      </div>
    </div>
  );
}

function SearchPanel({ conversation, memoryState }: WorkbenchProps) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const messages = normalized
    ? conversation.messages.filter((message) => message.content.toLowerCase().includes(normalized))
    : conversation.messages.slice(-5);
  const memories = normalized
    ? memoryState.items.filter((item) => `${item.content} ${item.type}`.toLowerCase().includes(normalized))
    : memoryState.items.slice(0, 5);

  return (
    <div className="drawer-body">
      <label className="search-box">
        <Search size={18} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索对话、记忆、来源..." />
      </label>
      <section className="drawer-section">
        <h3>消息</h3>
        <div className="result-list">
          {messages.map((message) => (
            <div className="result-row" key={message.id}>
              <strong>{message.role === "user" ? "用户" : "智能体"}</strong>
              <p>{message.content}</p>
            </div>
          ))}
          {!messages.length && <p className="empty-copy">没有匹配的消息。</p>}
        </div>
      </section>
      <section className="drawer-section">
        <h3>记忆</h3>
        <div className="result-list">
          {memories.map((item) => (
            <div className="result-row" key={item.id}>
              <strong>{humanizeMemoryType(item.type)} · {item.level}</strong>
              <p>{item.content}</p>
            </div>
          ))}
          {!memories.length && <p className="empty-copy">没有匹配的记忆。</p>}
        </div>
      </section>
    </div>
  );
}

function WebSearchPanel({ draft, webSearchState, busyAction, activeMode, runWebSearch, setDraft, chooseMode, notify }: WorkbenchProps) {
  const [query, setQuery] = useState(draft);
  const searching = busyAction === "web-search";
  const results = webSearchState?.results || [];

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await runWebSearch(query);
  }

  function useAsPrompt() {
    if (!query.trim()) {
      notify("请输入要联网搜索的问题。");
      return;
    }
    setDraft(query.trim());
    if (activeMode !== "web") chooseMode("web");
    notify("已写入输入框；发送后会先联网搜索再回答。");
  }

  return (
    <div className="drawer-body">
      <form className="web-search-form" onSubmit={handleSearch}>
        <label className="search-box">
          <Globe2 size={18} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索最新资料、产品信息、网页内容..." />
        </label>
        <div className="drawer-actions">
          <button type="submit" disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
            {searching ? "搜索中" : "联网搜索"}
          </button>
          <button type="button" onClick={useAsPrompt} disabled={!query.trim()}>
            <Send size={16} />作为联网问题
          </button>
        </div>
      </form>
      <section className="drawer-section">
        <h3>{webSearchState ? `“${webSearchState.query}” 的结果` : "搜索结果"}</h3>
        <div className="result-list web-result-list">
          {results.map((item) => (
            <a className="result-row web-result-row" key={item.url} href={item.url} target="_blank" rel="noreferrer">
              <strong>{item.title}</strong>
              <p>{item.snippet || "没有可用摘要。"}</p>
              <small>{item.source}</small>
            </a>
          ))}
          {webSearchState && !results.length && <p className="empty-copy">没有拿到可用搜索结果，请换一个关键词。</p>}
          {!webSearchState && <p className="empty-copy">输入关键词后会从网络搜索，并可把结果注入下一次聊天。</p>}
        </div>
      </section>
    </div>
  );
}

function ToolsPanel({ testModel, organizeMemory, generateSummary, commitCandidates, pendingCandidates, saving, busyAction, chooseMode, notify }: WorkbenchProps) {
  const testing = busyAction === "model-test";
  const organizing = busyAction === "memory-organize";
  const committing = busyAction === "memory-commit";
  return (
    <div className="drawer-body">
      <div className="tool-grid">
        <button type="button" onClick={testModel} disabled={testing || saving}>{testing ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}<strong>{testing ? "测试中" : "测试模型连接"}</strong><span>检查当前供应商 API Key 和模型名。</span></button>
        <button type="button" onClick={() => chooseMode("web")}><Globe2 size={18} /><strong>联网搜索</strong><span>下一条消息会先搜索网络，再把结果注入模型上下文。</span></button>
        <button type="button" onClick={organizeMemory} disabled={organizing || saving}>{organizing ? <Loader2 className="spin" size={18} /> : <Database size={18} />}<strong>{organizing ? "整理中" : "整理长期记忆"}</strong><span>重写 memory.md 和索引。</span></button>
        <button type="button" onClick={generateSummary}><FileText size={18} /><strong>生成会话摘要</strong><span>基于最近消息生成摘要。</span></button>
        <button type="button" onClick={() => commitCandidates()} disabled={committing || saving}>{committing ? <Loader2 className="spin" size={18} /> : <ClipboardList size={18} />}<strong>{committing ? "提交中" : "提交候选记忆"}</strong><span>{pendingCandidates.length ? `${pendingCandidates.length} 条待提交` : "暂无候选，点击会给出提示。"}</span></button>
        <button type="button" onClick={() => notify("本地文件读取将在下一阶段接入；当前附件入口已可响应。")}><Paperclip size={18} /><strong>附件入口</strong><span>显示当前 MVP 的能力边界。</span></button>
        <button type="button" onClick={() => notify("语音识别将在下一阶段接入；当前会先生成文字整理提示。")}><Mic size={18} /><strong>语音入口</strong><span>显示当前 MVP 的能力边界。</span></button>
      </div>
    </div>
  );
}

function SummaryPanel({ generatedSummary, generateSummary, saveSummaryCandidate }: WorkbenchProps) {
  return (
    <div className="drawer-body">
      <div className="drawer-actions">
        <button type="button" onClick={generateSummary}><FileText size={16} />重新生成</button>
        <button type="button" onClick={saveSummaryCandidate} disabled={!generatedSummary.trim()}><Database size={16} />加入候选记忆</button>
      </div>
      <pre className="markdown-preview">{generatedSummary || "还没有生成摘要。"}</pre>
    </div>
  );
}
