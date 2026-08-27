import { AlertCircle, Briefcase, CheckCircle2, ClipboardList, Clock3, Code2, Cpu, Database, FileCode2, FileText, FolderOpen, Globe2, Loader2, Mic, Paperclip, Play, Search, Send, ShieldCheck, Wand2, X } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { getUiText } from "../i18n";
import type { AgentTool, ConversationSearchResult, ToolCategory } from "../types";
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

function SearchPanel({ agentConfig, conversation, memoryState, searchConversations, switchConversation, closePanel }: WorkbenchProps) {
  const [query, setQuery] = useState("");
  const [globalResults, setGlobalResults] = useState<ConversationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const text = getUiText(agentConfig.language);
  const normalized = query.trim().toLowerCase();
  const messages = normalized ? [] : conversation.messages.slice(-5);
  const memories = normalized
    ? memoryState.items.filter((item) => `${item.content} ${item.type}`.toLowerCase().includes(normalized))
    : memoryState.items.slice(0, 5);

  useEffect(() => {
    let cancelled = false;
    if (!normalized) {
      setGlobalResults([]);
      setSearching(false);
      return () => { cancelled = true; };
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const results = await searchConversations(normalized);
      if (!cancelled) {
        setGlobalResults(results);
        setSearching(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalized]);

  async function openSearchResult(result: ConversationSearchResult) {
    await switchConversation(result.conversationId);
    closePanel();
  }

  return (
    <div className="drawer-body">
      <label className="search-box">
        <Search size={18} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchPanel.placeholder} />
      </label>
      <section className="drawer-section">
        <h3>{normalized ? (agentConfig.language === "en" ? "All conversations" : "全部会话") : text.searchPanel.messages}</h3>
        <div className="result-list">
          {normalized ? globalResults.map((result) => (
            <button type="button" className="result-row search-result-button" key={`${result.conversationId}-${result.messageId}`} onClick={() => openSearchResult(result)}>
              <strong>{result.conversationTitle} · {result.role === "user" ? text.common.user : text.common.assistant}</strong>
              <p>{result.snippet}</p>
            </button>
          )) : messages.map((message) => (
            <div className="result-row" key={message.id}>
              <strong>{message.role === "user" ? text.common.user : text.common.assistant}</strong>
              <p>{message.content}</p>
            </div>
          ))}
          {searching && <p className="empty-copy">{agentConfig.language === "en" ? "Searching..." : "正在搜索..."}</p>}
          {!searching && !(normalized ? globalResults.length : messages.length) && <p className="empty-copy">{text.searchPanel.noMessages}</p>}
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

function ToolsPanel({ agentConfig, draft, tools, tasks, runTool, approveTask, cancelTask, testModel, organizeMemory, generateSummary, commitCandidates, pendingCandidates, saving, busyAction, chooseMode, notify, workspaceRoot }: WorkbenchProps) {
  const [objective, setObjective] = useState(draft);
  const [selectedTool, setSelectedTool] = useState<AgentTool | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [activeToolCategory, setActiveToolCategory] = useState<ToolCategory>("work");
  const testing = busyAction === "model-test";
  const organizing = busyAction === "memory-organize";
  const committing = busyAction === "memory-commit";
  const runningTool = busyAction === "tool-run";
  const text = getUiText(agentConfig.language);
  const isEnglish = agentConfig.language === "en";

  function selectTool(tool: AgentTool) {
    setSelectedTool(tool);
    setInputs(defaultInputs(tool));
  }

  function selectToolCategory(category: ToolCategory) {
    setActiveToolCategory(category);
    setSelectedTool(null);
    setInputs({});
  }

  async function executeTool() {
    if (!selectedTool) return;
    if (!objective.trim()) {
      notify(isEnglish ? "Enter a task objective first." : "请先输入任务目标。");
      return;
    }
    const missing = (selectedTool.inputSchema.required || []).find((field) => !inputs[field]?.trim());
    if (missing) {
      notify(isEnglish ? `Missing required field: ${missing}` : `缺少必填参数：${missing}`);
      return;
    }
    await runTool(selectedTool.id, objective, normalizedInputs(selectedTool, inputs));
  }

  const visibleTools = tools.filter((tool) => tool.category === activeToolCategory);
  const fields = selectedTool ? Object.keys(selectedTool.inputSchema.properties) : [];

  return (
    <div className="drawer-body">
      <section className="drawer-section tool-runtime">
        <div className="section-head">
          <div>
            <h3>{isEnglish ? "Agent Tool Runtime" : "智能体工具运行台"}</h3>
            <p>{isEnglish ? "Read tools run automatically; write and office tools need approval." : "只读工具自动执行；写入与办公工具需人工确认后执行。"}</p>
          </div>
          <span className="runtime-badge"><ShieldCheck size={14} />{isEnglish ? "Controlled" : "受控执行"}</span>
        </div>
        <label className="task-objective">
          <span>{isEnglish ? "Task objective" : "任务目标"}</span>
          <textarea
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder={isEnglish ? "Describe what the tool should create, find or verify..." : "描述需要工具创建、查找或验证的内容..."}
            maxLength={500}
          />
        </label>

        <div className="tool-category-tabs" role="tablist" aria-label={isEnglish ? "Tool category" : "工具分类"}>
          <button
            type="button"
            role="tab"
            aria-selected={activeToolCategory === "work"}
            className={activeToolCategory === "work" ? "active" : ""}
            onClick={() => selectToolCategory("work")}
          >
            <Briefcase size={16} />
            <span><strong>Work</strong><small>{isEnglish ? "Search & office" : "检索与办公"}</small></span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeToolCategory === "coding"}
            className={activeToolCategory === "coding" ? "active" : ""}
            onClick={() => selectToolCategory("coding")}
          >
            <Code2 size={16} />
            <span><strong>{isEnglish ? "Coding" : "编程"}</strong><small>{isEnglish ? "Local code & files" : "本地代码与文件"}</small></span>
          </button>
        </div>

        <div className="tool-group">
          <div className="tool-category-head">
            <div>
              <h4>{activeToolCategory === "work" ? "Work" : (isEnglish ? "Coding" : "编程")}</h4>
              <p>{activeToolCategory === "work"
                ? (isEnglish ? "Search information and create office documents." : "检索信息、调用记忆并生成办公文档。")
                : (isEnglish ? "Read, search, create and patch local code." : "读取、检索、创建和修改本地代码。")}</p>
            </div>
            <span>{visibleTools.length}</span>
          </div>
          <div className="tool-grid registered-tools">
            {visibleTools.map((tool) => (
              <button type="button" key={tool.id} onClick={() => selectTool(tool)} className={selectedTool?.id === tool.id ? "selected" : ""}>
                {toolIcon(tool.id, activeToolCategory === "work" ? <Briefcase size={18} /> : <FileCode2 size={18} />)}
                <strong>{tool.name}</strong><span>{tool.description}</span>
                <small><ShieldCheck size={12} />{tool.permission === "read" ? (isEnglish ? "Read-only · auto" : "只读 · 自动执行") : (isEnglish ? "Approval required" : "需要人工确认")}</small>
                <Play className="tool-play" size={15} />
              </button>
            ))}
          </div>
        </div>

        {selectedTool && (
          <div className="tool-form">
            <div className="tool-form-head">
              <h4>{selectedTool.name}</h4>
              <button type="button" className="tool-form-cancel" onClick={() => setSelectedTool(null)}>{isEnglish ? "Cancel" : "取消"}</button>
            </div>
            {fields.map((field) => (
              <ToolFormField
                key={field}
                tool={selectedTool}
                field={field}
                required={(selectedTool.inputSchema.required || []).includes(field)}
                value={inputs[field] || ""}
                onChange={(value) => setInputs((current) => ({ ...current, [field]: value }))}
              />
            ))}
            {fields.length === 0 && (
              <p className="empty-copy">{isEnglish ? "No parameters needed; click run." : "无需参数，点击执行即可。"}</p>
            )}
            <div className="drawer-actions">
              <button type="button" onClick={executeTool} disabled={runningTool || saving}>
                {runningTool ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                {isEnglish ? "Run tool" : "执行工具"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="drawer-section task-timeline">
        <div className="section-head">
          <h3>{isEnglish ? "Execution timeline" : "执行时间线"}</h3>
          <span>{isEnglish ? `${tasks.length} tasks` : `${tasks.length} 个任务`}</span>
        </div>
        <div className="task-list">
          {tasks.slice(0, 8).map((task) => {
            const step = task.steps[task.steps.length - 1];
            const failed = task.status === "failed";
            return (
              <article className={`task-record ${task.status}`} key={task.id}>
                <div className="task-status-icon">
                  {task.status === "running" ? <Loader2 className="spin" size={16} /> : failed ? <AlertCircle size={16} /> : task.status === "waiting_approval" ? <Clock3 size={16} /> : <CheckCircle2 size={16} />}
                </div>
                <div>
                  <strong>{task.title}</strong>
                  <p>{step?.result?.summary || step?.error?.message || task.objective}</p>
                  <small>{step?.title || step?.toolId} · {formatTaskTime(task.updatedAt, agentConfig.language)}</small>
                </div>
                <span className="task-status-label">{taskStatusLabel(task.status, agentConfig.language)}</span>
                {task.status === "waiting_approval" && step && (
                  <div className="task-approval-actions">
                    <button type="button" className="approve-button" onClick={() => approveTask(task.id)} disabled={runningTool || saving}>
                      <ShieldCheck size={13} />{isEnglish ? "Approve" : "确认执行"}
                    </button>
                    <button type="button" className="cancel-task-button" onClick={() => cancelTask(task.id)} disabled={runningTool || saving}>
                      <X size={13} />{isEnglish ? "Cancel" : "取消任务"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {!tasks.length && <p className="empty-copy">{isEnglish ? "No tool executions yet." : "暂无工具执行记录。"}</p>}
        </div>
      </section>

      <section className="drawer-section workspace-path">
        <h3>{isEnglish ? "Local workspace" : "本地工作区"}</h3>
        <p className="workspace-path-value"><FolderOpen size={14} />{workspaceRoot || (isEnglish ? "loading..." : "加载中...")}</p>
        <small>{isEnglish ? "All file and office tools are confined to this directory." : "所有文件与办公工具都被限制在该目录内。"}</small>
      </section>

      <section className="drawer-section">
        <h3>{isEnglish ? "Workspace actions" : "工作台操作"}</h3>
      <div className="tool-grid">
        <button type="button" onClick={testModel} disabled={testing || saving}>{testing ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}<strong>{testing ? text.model.testing : text.toolsPanel.testModel}</strong><span>{text.toolsPanel.testModelHint}</span></button>
        <button type="button" onClick={() => chooseMode("web")}><Globe2 size={18} /><strong>{text.chat.webSearch}</strong><span>{text.toolsPanel.webSearchHint}</span></button>
        <button type="button" onClick={organizeMemory} disabled={organizing || saving}>{organizing ? <Loader2 className="spin" size={18} /> : <Database size={18} />}<strong>{organizing ? text.memory.organizing : text.toolsPanel.organizeMemory}</strong><span>{text.toolsPanel.organizeMemoryHint}</span></button>
        <button type="button" onClick={generateSummary}><FileText size={18} /><strong>{text.toolsPanel.generateSummary}</strong><span>{text.toolsPanel.generateSummaryHint}</span></button>
        <button type="button" onClick={() => commitCandidates()} disabled={committing || saving}>{committing ? <Loader2 className="spin" size={18} /> : <ClipboardList size={18} />}<strong>{committing ? text.memory.committing : text.toolsPanel.commitCandidates}</strong><span>{pendingCandidates.length ? text.toolsPanel.pendingCandidates(pendingCandidates.length) : text.toolsPanel.noCandidates}</span></button>
        <button type="button" onClick={() => notify(text.status.attachmentReady)}><Paperclip size={18} /><strong>{text.toolsPanel.attachment}</strong><span>{text.toolsPanel.attachmentHint}</span></button>
        <button type="button" onClick={() => notify(text.status.voiceReady)}><Mic size={18} /><strong>{text.toolsPanel.voice}</strong><span>{text.toolsPanel.voiceHint}</span></button>
      </div>
      </section>
    </div>
  );
}

function ToolFormField({ tool, field, required, value, onChange }: { tool: AgentTool; field: string; required: boolean; value: string; onChange: (value: string) => void }) {
  const definition = tool.inputSchema.properties[field];
  const multiline = isMultilineField(field);
  const placeholder = field === "sections" || field === "blocks"
    ? '[{"heading": "进展", "paragraphs": ["..."], "bullets": ["..."]}]'
    : field === "path"
      ? "docs/report.md"
      : field === "task"
        ? "把整个任务交给 DeepSeek Harness 自主执行，例如：把 src/utils.ts 里缺失的 debounce 补上并加测试。"
        : field === "sandbox"
          ? "read-only 或 workspace-write"
          : field;
  const label = field === "sections" ? "sections (JSON)"
    : field === "blocks" ? "blocks (JSON)"
      : field === "task" ? "task (交给 DSH 的任务)"
        : field === "sandbox" ? "sandbox (沙箱级别)"
          : field;
  return (
    <label className={`tool-form-field ${multiline ? "multiline" : ""}`}>
      <span>{label}{required ? " *" : ""}{definition?.maxLength ? ` (max ${definition.maxLength})` : ""}</span>
      {multiline
        ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
        : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}
    </label>
  );
}

function defaultInputs(tool: AgentTool): Record<string, string> {
  const defaults: Record<string, Record<string, string>> = {
    "web.search": { query: "", limit: "5" },
    "memory.search": { query: "", limit: "5" },
    "workspace.list": { path: ".", depth: "2" },
    "workspace.read": { path: "", maxChars: "50000" },
    "workspace.grep": { pattern: "", path: ".", maxMatches: "50" },
    "workspace.write": { path: "", content: "" },
    "workspace.patch": { path: "", oldString: "", newString: "" },
    "agent.task": { task: "", backend: "dsh", sandbox: "read-only" },
    "office.document": { title: "", summary: "", path: "", sections: "" },
    "office.docx": { title: "", path: "", blocks: "" }
  };
  return defaults[tool.id] || {};
}

function normalizedInputs(tool: AgentTool, inputs: Record<string, string>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const required = new Set(tool.inputSchema.required || []);
  for (const [field, value] of Object.entries(inputs)) {
    const definition = tool.inputSchema.properties[field];
    if (!required.has(field) && !value.trim()) continue;
    normalized[field] = definition?.type === "integer" ? Number(value) : value;
  }
  return normalized;
}

function isMultilineField(field: string) {
  return ["content", "oldString", "newString", "sections", "blocks", "summary", "task"].includes(field);
}

function toolIcon(toolId: string, fallback: ReactNode) {
  if (toolId === "workspace.list") return <FolderOpen size={18} />;
  if (toolId === "workspace.read") return <FileText size={18} />;
  if (toolId === "workspace.grep") return <Search size={18} />;
  if (toolId === "workspace.patch") return <Wand2 size={18} />;
  if (toolId === "agent.task") return <Cpu size={18} />;
  if (toolId === "office.document" || toolId === "office.docx") return <Briefcase size={18} />;
  return fallback;
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

function taskStatusLabel(status: WorkbenchProps["tasks"][number]["status"], language: "zh" | "en") {
  const labels = language === "en"
    ? { waiting_approval: "Approval", running: "Running", completed: "Completed", failed: "Failed", cancelled: "Cancelled" }
    : { waiting_approval: "待确认", running: "执行中", completed: "已完成", failed: "失败", cancelled: "已取消" };
  return labels[status];
}

function formatTaskTime(value: string, language: "zh" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
