import { CheckCircle2, ClipboardList, Database, FileText, Globe2, Loader2, Mic, Paperclip, Search, Send, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { getUiText } from "../i18n";
import type { WorkbenchProps, ActivePanel } from "../workbenchTypes";
import { AgentEditorPanel, SettingsPanel } from "./SettingsPanels";
import { MemoryDetailPanel } from "./MemoryPanel";
import { TeamPanel } from "./TeamPanel";
import { humanizeMemoryType } from "./ui";

export function InteractionPanel(props: WorkbenchProps) {
  const { agentConfig, renderedPanel, panelPhase, closePanel } = props;
  // settings 和 memory 面板现由 DesktopWorkbench 直接渲染（左/右抽屉），InteractionPanel 不处理
  if (!renderedPanel || renderedPanel === "settings" || renderedPanel === "memory") return null;
  const text = getUiText(agentConfig.language);
  const titles: Record<Exclude<ActivePanel, null>, string> = text.panels;

  return (
    <div className={`overlay ${panelPhase}`} role="dialog" aria-modal="true" aria-label={titles[renderedPanel]} onMouseDown={(event) => {
      if (event.target === event.currentTarget) closePanel();
    }}>
      <div className={`drawer ${panelPhase}`}>
        <header className="drawer-head">
          <div>
            <span>{text.panels.workspace}</span>
            <h2>{titles[renderedPanel]}</h2>
          </div>
          <button type="button" onClick={closePanel} aria-label={text.common.close}><X size={20} /></button>
        </header>
        {renderedPanel === "search" && <SearchPanel {...props} />}
        {renderedPanel === "tools" && <ToolsPanel {...props} />}
        {renderedPanel === "summary" && <SummaryPanel {...props} />}
        {renderedPanel === "agent" && <AgentEditorPanel {...props} />}
        {renderedPanel === "webSearch" && <WebSearchPanel {...props} />}
        {renderedPanel === "team" && <TeamPanel {...props} />}
      </div>
    </div>
  );
}

function SearchPanel({ agentConfig, conversation, memoryState }: WorkbenchProps) {
  const [query, setQuery] = useState("");
  const text = getUiText(agentConfig.language);
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
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchPanel.placeholder} />
      </label>
      <section className="drawer-section">
        <h3>{text.searchPanel.messages}</h3>
        <div className="result-list">
          {messages.map((message) => (
            <div className="result-row" key={message.id}>
              <strong>{message.role === "user" ? text.common.user : text.common.assistant}</strong>
              <p>{message.content}</p>
            </div>
          ))}
          {!messages.length && <p className="empty-copy">{text.searchPanel.noMessages}</p>}
        </div>
      </section>
      <section className="drawer-section">
        <h3>{text.searchPanel.memories}</h3>
        <div className="result-list">
          {memories.map((item) => (
            <div className="result-row" key={item.id}>
              <strong>{humanizeMemoryType(item.type, agentConfig.language)} · {item.level}</strong>
              <p>{item.content}</p>
            </div>
          ))}
          {!memories.length && <p className="empty-copy">{text.searchPanel.noMemories}</p>}
        </div>
      </section>
    </div>
  );
}

function WebSearchPanel({ agentConfig, draft, webSearchState, busyAction, activeMode, runWebSearch, setDraft, chooseMode, notify }: WorkbenchProps) {
  const [query, setQuery] = useState(draft);
  const searching = busyAction === "web-search";
  const results = webSearchState?.results || [];
  const text = getUiText(agentConfig.language);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await runWebSearch(query);
  }

  function useAsPrompt() {
    if (!query.trim()) {
      notify(text.webSearchPanel.questionRequired);
      return;
    }
    setDraft(query.trim());
    if (activeMode !== "web") chooseMode("web");
    notify(text.webSearchPanel.promptReady);
  }

  return (
    <div className="drawer-body">
      <form className="web-search-form" onSubmit={handleSearch}>
        <label className="search-box">
          <Globe2 size={18} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.webSearchPanel.placeholder} />
        </label>
        <div className="drawer-actions">
          <button type="submit" disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
            {searching ? text.webSearchPanel.searching : text.webSearchPanel.webSearch}
          </button>
          <button type="button" onClick={useAsPrompt} disabled={!query.trim()}>
            <Send size={16} />{text.webSearchPanel.useAsPrompt}
          </button>
        </div>
      </form>
      <section className="drawer-section">
        <h3>{webSearchState ? text.webSearchPanel.resultsFor(webSearchState.query) : text.webSearchPanel.results}</h3>
        <div className="result-list web-result-list">
          {results.map((item) => (
            <a className="result-row web-result-row" key={item.url} href={item.url} target="_blank" rel="noreferrer">
              <strong>{item.title}</strong>
              <p>{item.snippet || text.webSearchPanel.noSnippet}</p>
              <small>{item.source}</small>
            </a>
          ))}
          {webSearchState && !results.length && <p className="empty-copy">{text.webSearchPanel.noResults}</p>}
          {!webSearchState && <p className="empty-copy">{text.webSearchPanel.empty}</p>}
        </div>
      </section>
    </div>
  );
}

function ToolsPanel({ agentConfig, testModel, organizeMemory, generateSummary, commitCandidates, pendingCandidates, saving, busyAction, chooseMode, notify }: WorkbenchProps) {
  const testing = busyAction === "model-test";
  const organizing = busyAction === "memory-organize";
  const committing = busyAction === "memory-commit";
  const text = getUiText(agentConfig.language);
  return (
    <div className="drawer-body">
      <div className="tool-grid">
        <button type="button" onClick={testModel} disabled={testing || saving}>{testing ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}<strong>{testing ? text.model.testing : text.toolsPanel.testModel}</strong><span>{text.toolsPanel.testModelHint}</span></button>
        <button type="button" onClick={() => chooseMode("web")}><Globe2 size={18} /><strong>{text.chat.webSearch}</strong><span>{text.toolsPanel.webSearchHint}</span></button>
        <button type="button" onClick={organizeMemory} disabled={organizing || saving}>{organizing ? <Loader2 className="spin" size={18} /> : <Database size={18} />}<strong>{organizing ? text.memory.organizing : text.toolsPanel.organizeMemory}</strong><span>{text.toolsPanel.organizeMemoryHint}</span></button>
        <button type="button" onClick={generateSummary}><FileText size={18} /><strong>{text.toolsPanel.generateSummary}</strong><span>{text.toolsPanel.generateSummaryHint}</span></button>
        <button type="button" onClick={() => commitCandidates()} disabled={committing || saving}>{committing ? <Loader2 className="spin" size={18} /> : <ClipboardList size={18} />}<strong>{committing ? text.memory.committing : text.toolsPanel.commitCandidates}</strong><span>{pendingCandidates.length ? text.toolsPanel.pendingCandidates(pendingCandidates.length) : text.toolsPanel.noCandidates}</span></button>
        <button type="button" onClick={() => notify(text.status.attachmentReady)}><Paperclip size={18} /><strong>{text.toolsPanel.attachment}</strong><span>{text.toolsPanel.attachmentHint}</span></button>
        <button type="button" onClick={() => notify(text.status.voiceReady)}><Mic size={18} /><strong>{text.toolsPanel.voice}</strong><span>{text.toolsPanel.voiceHint}</span></button>
      </div>
    </div>
  );
}

function SummaryPanel({ agentConfig, generatedSummary, generateSummary, saveSummaryCandidate }: WorkbenchProps) {
  const text = getUiText(agentConfig.language);
  return (
    <div className="drawer-body">
      <div className="drawer-actions">
        <button type="button" onClick={generateSummary}><FileText size={16} />{text.summaryPanel.regenerate}</button>
        <button type="button" onClick={saveSummaryCandidate} disabled={!generatedSummary.trim()}><Database size={16} />{text.summaryPanel.addToCandidates}</button>
      </div>
      <pre className="markdown-preview">{generatedSummary || text.common.noSummary}</pre>
    </div>
  );
}
