import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  Globe2,
  Loader2,
  Mic,
  Paperclip,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  X
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { AgentConfig, Conversation, MemoryItem, MemoryState, ModelConfig, ModelProviderConfig, ProviderId } from "./types";

const providerOrder: ProviderId[] = ["openai-compatible", "openai", "deepseek", "anthropic"];
const contextLengthOptions = [32000, 64000, 128000];
type ActivePanel = "search" | "settings" | "memory" | "tools" | "summary" | "agent" | null;
type ChatMode = "normal" | "thinking" | "memory" | "tools";

function App() {
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [memoryState, setMemoryState] = useState<MemoryState | null>(null);
  const [pendingCandidates, setPendingCandidates] = useState<MemoryItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [mobileView, setMobileView] = useState<"chat" | "settings">("chat");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [activeMode, setActiveMode] = useState<ChatMode>("normal");
  const [generatedSummary, setGeneratedSummary] = useState("");

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const [agent, model, activeConversation, memory] = await Promise.all([
          api.getAgentConfig(),
          api.getModelConfig(),
          api.getConversation(),
          api.getMemory()
        ]);
        if (!mounted) return;
        setAgentConfig(agent);
        setModelConfig(model);
        setConversation(activeConversation);
        setMemoryState(memory);
      } catch (bootError) {
        setError(errorMessage(bootError));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    boot();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedProvider = useMemo(() => {
    if (!modelConfig) return null;
    return modelConfig.providers[modelConfig.selectedProvider];
  }, [modelConfig]);

  async function updateAgent(next: AgentConfig) {
    setAgentConfig(next);
    setSaving(true);
    try {
      const saved = await api.saveAgentConfig(next);
      setAgentConfig(saved);
      setStatus("Agent settings synced");
      setError("");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function saveModel(next: ModelConfig) {
    setModelConfig(next);
    setSaving(true);
    try {
      const saved = await api.saveModelConfig(next);
      setModelConfig(saved);
      setStatus("Model settings synced");
      setError("");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function testModel() {
    setSaving(true);
    try {
      const result = await api.testModel();
      setStatus(`Model replied: ${result.message}`);
      setModelConfig(await api.getModelConfig());
      setError("");
    } catch (testError) {
      setError(errorMessage(testError));
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    setSending(true);
    setError("");
    try {
      const result = await api.chat(content, activeMode);
      setConversation(result.conversation);
      setPendingCandidates((current) => [...result.candidates, ...current].slice(0, 6));
      setMemoryState(await api.getMemory());
      setStatus(result.relevantMemories.length ? `Loaded ${result.relevantMemories.length} memories` : "No memory matched");
    } catch (chatError) {
      setError(errorMessage(chatError));
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  async function commitCandidates(items = pendingCandidates) {
    if (!items.length) {
      setStatus("暂无候选记忆可提交。");
      setActivePanel("memory");
      return;
    }
    setSaving(true);
    try {
      const result = await api.commitMemory(items);
      const memory = await api.getMemory();
      setMemoryState(memory);
      setPendingCandidates([]);
      setStatus(`Saved to ${result.rawPath}`);
      setError("");
    } catch (commitError) {
      setError(errorMessage(commitError));
    } finally {
      setSaving(false);
    }
  }

  async function organizeMemory() {
    setSaving(true);
    try {
      await api.organizeMemory();
      setMemoryState(await api.getMemory());
      setStatus("memory.md organized");
      setError("");
    } catch (organizeError) {
      setError(errorMessage(organizeError));
    } finally {
      setSaving(false);
    }
  }

  function notify(message: string) {
    setStatus(message);
    setError("");
  }

  function openPanel(panel: Exclude<ActivePanel, null>, message?: string) {
    setActivePanel(panel);
    if (message) notify(message);
  }

  function closePanel() {
    const closingPanel = activePanel;
    setActivePanel(null);
    if ((closingPanel === "memory" && activeMode === "memory") || (closingPanel === "tools" && activeMode === "tools")) {
      setActiveMode("normal");
      notify("已回到普通对话模式。");
    }
  }

  function chooseMode(mode: ChatMode) {
    if (activeMode === mode) {
      setActiveMode("normal");
      if ((mode === "memory" && activePanel === "memory") || (mode === "tools" && activePanel === "tools")) {
        setActivePanel(null);
      }
      notify("已回到普通对话模式。");
      return;
    }
    setActiveMode(mode);
    const labels: Record<ChatMode, string> = {
      normal: "普通对话模式",
      thinking: "深度思考模式已启用，下一条消息会要求先分析再回答。",
      memory: "记忆整理模式已启用，下一条消息会优先识别候选记忆。",
      tools: "工具模式已启用，可从工具面板触发本地动作。"
    };
    notify(labels[mode]);
    if (mode === "tools") setActivePanel("tools");
    if (mode === "memory") setActivePanel("memory");
  }

  function generateSummary() {
    const messages = conversation?.messages.slice(-6) || [];
    const summary = messages.length
      ? [
          `会话：${conversation?.title || "当前对话"}`,
          `最近 ${messages.length} 条消息围绕长期记忆、候选审核和执行约束展开。`,
          `最新用户问题：${messages.filter((item) => item.role === "user").slice(-1)[0]?.content || "暂无"}`,
          `当前已加载记忆：${memoryState?.stats.loaded || 0} 条；候选记忆：${pendingCandidates.length} 条。`
        ].join("\n")
      : "当前没有可总结的对话。";
    setGeneratedSummary(summary);
    setActivePanel("summary");
    notify("已生成本地摘要。");
  }

  function saveSummaryCandidate() {
    if (!generatedSummary.trim()) return;
    const candidate: MemoryItem = {
      id: `candidate-summary-${Date.now().toString(36)}`,
      content: generatedSummary.split("\n").slice(1).join(" ").slice(0, 140),
      type: "conversation_summary",
      level: "medium",
      source: "summary",
      updatedAt: new Date().toISOString(),
      status: "candidate"
    };
    setPendingCandidates((current) => [candidate, ...current].slice(0, 6));
    setActivePanel("memory");
    notify("摘要已加入候选记忆。");
  }

  function handleAttachment() {
    setActivePanel("tools");
    notify("附件入口已响应；第一版先通过工具面板管理本地动作。");
  }

  function handleVoice() {
    if (!draft.trim()) setDraft("请把这段语音内容整理成文字：");
    notify("语音入口已响应；已在输入框放入语音整理提示。");
  }

  if (loading || !agentConfig || !modelConfig || !conversation || !memoryState || !selectedProvider) {
    return (
      <main className="loading-screen">
        <Loader2 className="spin" size={24} />
        <span>正在加载 Memory Agent...</span>
      </main>
    );
  }

  const sharedProps = {
    agentConfig,
    modelConfig,
    selectedProvider,
    conversation,
    memoryState,
    pendingCandidates,
    draft,
    saving,
    sending,
    status,
    error,
    activePanel,
    activeMode,
    generatedSummary,
    setDraft,
    updateAgent,
    saveModel,
    testModel,
    sendMessage,
    commitCandidates,
    organizeMemory,
    setMobileView,
    openPanel,
    setActivePanel,
    closePanel,
    chooseMode,
    generateSummary,
    saveSummaryCandidate,
    handleAttachment,
    handleVoice,
    notify
  };

  return (
    <>
      <DesktopWorkbench {...sharedProps} />
      <MobileWorkbench {...sharedProps} mobileView={mobileView} />
      <InteractionPanel {...sharedProps} />
    </>
  );
}

function DesktopWorkbench(props: WorkbenchProps) {
  return (
    <main className="desktop-shell">
      <AgentSidebar {...props} />
      <ChatPanel {...props} />
      <MemoryPanel {...props} />
    </main>
  );
}

function MobileWorkbench(props: WorkbenchProps & { mobileView: "chat" | "settings" }) {
  return (
    <main className="mobile-shell">
      {props.mobileView === "chat" ? <MobileChat {...props} /> : <MobileSettings {...props} />}
    </main>
  );
}

function AgentSidebar({ agentConfig, modelConfig, selectedProvider, updateAgent }: WorkbenchProps) {
  return (
    <aside className="agent-sidebar">
      <div className="brand-row">
        <div className="brand-mark">
          <Sparkles size={24} />
        </div>
        <div>
          <h1>{agentConfig.name}</h1>
          <p><span className="live-dot" />长期记忆已启用</p>
        </div>
      </div>

      <section className="soft-block language-block">
        <div>
          <strong>界面语言</strong>
          <span>中文 / English</span>
        </div>
        <Segmented
          value={agentConfig.language}
          options={[
            ["zh", "中"],
            ["en", "EN"]
          ]}
          onChange={(value) => updateAgent({ ...agentConfig, language: value as "zh" | "en" })}
        />
      </section>

      <section className="panel-section">
        <h2>角色设定</h2>
        <div className="role-card">
          <input
            aria-label="角色标题"
            value={agentConfig.roleTitle}
            onChange={(event) => updateAgent({ ...agentConfig, roleTitle: event.target.value })}
          />
          <textarea
            aria-label="角色描述"
            value={agentConfig.roleDescription}
            onChange={(event) => updateAgent({ ...agentConfig, roleDescription: event.target.value })}
          />
        </div>
      </section>

      <section className="panel-section">
        <h2>行为模式</h2>
        <ToggleRow
          title="主动追问"
          subtitle="缺少信息时先确认"
          checked={agentConfig.behavior.proactiveFollowup}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, proactiveFollowup: checked } })}
        />
        <ToggleRow
          title="记录记忆"
          subtitle="沉淀稳定事实"
          checked={agentConfig.behavior.autoSaveNotes}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, autoSaveNotes: checked } })}
        />
        <ToggleRow
          title="严格遵守角色"
          subtitle="限制越界输出"
          checked={agentConfig.behavior.strictRetrieval}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, strictRetrieval: checked } })}
        />
      </section>

      <section className="panel-section">
        <div className="section-head">
          <h2>对话温度</h2>
          <span>{agentConfig.temperature.toFixed(2)}</span>
        </div>
        <input
          className="range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={agentConfig.temperature}
          onChange={(event) => updateAgent({ ...agentConfig, temperature: Number(event.target.value) })}
        />
        <div className="range-labels">
          <span>稳定</span>
          <span>平衡</span>
          <span>创造</span>
        </div>
      </section>

      <section className="panel-section model-summary">
        <h2>模型配置</h2>
        <InfoLine label="模型" value={selectedProvider.model} />
        <InfoLine label="API" value={selectedProvider.apiKeySet ? "已连接" : "未配置"} tone={selectedProvider.apiKeySet ? "green" : "amber"} />
        <InfoLine label="供应商" value={modelConfig.providers[modelConfig.selectedProvider].label} />
        <InfoLine label="上下文" value={`${Math.round(selectedProvider.contextLength / 1000)}k`} />
      </section>

      <div className="hint-block">
        <Database size={18} />
        <span>记忆写入前会先进候选区，确认后同步到 memory.md。</span>
      </div>
    </aside>
  );
}

function ChatPanel({
  agentConfig,
  conversation,
  draft,
  sending,
  status,
  error,
  activeMode,
  setDraft,
  updateAgent,
  sendMessage,
  organizeMemory,
  pendingCandidates,
  openPanel,
  chooseMode,
  generateSummary,
  handleAttachment,
  handleVoice
}: WorkbenchProps) {
  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div>
          <h2>{conversation.title}</h2>
          <p><span className="blue-dot" />{agentConfig.name} · 已加载长期记忆 · 可调用工具</p>
        </div>
        <div className="header-actions">
          <IconButton label="搜索" onClick={() => openPanel("search")}><Search size={20} /></IconButton>
          <IconButton label="设置" onClick={() => openPanel("settings")}><SlidersHorizontal size={20} /></IconButton>
          <Segmented
            value={agentConfig.language}
            options={[["zh", "中"], ["en", "EN"]]}
            onChange={(value) => updateAgent({ ...agentConfig, language: value as "zh" | "en" })}
          />
        </div>
      </header>

      <div className="chat-scroll">
        <div className="memory-toast">
          <BrainCircuit size={22} />
          <span>已结合你的项目偏好、近期讨论和 memory.md 片段回答；候选记忆会在右侧等待确认。</span>
        </div>
        {conversation.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {error && <div className="error-banner">{error}</div>}
      </div>

      <footer className="composer-zone">
        <div className="quick-actions">
          <button type="button" className={activeMode === "thinking" ? "active" : ""} onClick={() => chooseMode("thinking")}><BrainCircuit size={16} />深度思考</button>
          <button type="button" className={activeMode === "memory" ? "primary-soft active" : "primary-soft"} onClick={() => chooseMode("memory")}><Database size={16} />整理记忆</button>
          <button type="button" onClick={generateSummary}><FileText size={16} />生成摘要</button>
          <button type="button" className={activeMode === "tools" ? "active" : ""} onClick={() => chooseMode("tools")}><Wrench size={16} />调用工具</button>
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <button type="button" aria-label="附件" onClick={handleAttachment}><Paperclip size={21} /></button>
          <button type="button" aria-label="语音" onClick={handleVoice}><Mic size={21} /></button>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="发消息，或让智能体记住一件事..." />
          <button className="send-button" type="submit" disabled={sending}>
            {sending ? <Loader2 className="spin" size={22} /> : <Send size={24} />}
          </button>
        </form>
        <div className="status-line">{pendingCandidates.length ? `候选记忆 ${pendingCandidates.length} 条 · ${status}` : status}</div>
      </footer>
    </section>
  );
}

function MemoryPanel({ memoryState, pendingCandidates, saving, commitCandidates, openPanel }: WorkbenchProps) {
  const active = memoryState.items.filter((item) => item.status === "active");
  const candidates = pendingCandidates.length ? pendingCandidates : memoryState.items.filter((item) => item.status === "candidate");
  return (
    <aside className="memory-panel">
      <div className="memory-title">
        <span>LONG-TERM MEMORY</span>
        <strong>Memory Context</strong>
        <em>Live</em>
      </div>

      <div className="stats-card">
        <Stat value={String(memoryState.stats.loaded)} label="Loaded" />
        <Stat value={String(candidates.length)} label="Candidates" />
        <Stat value={`${memoryState.stats.editedMinutesAgo}m`} label="Edited" />
      </div>

      <button className="open-memory" onClick={() => openPanel("memory")} type="button">
        <FileText size={17} /> Open memory.md <ChevronRight size={17} />
      </button>

      <section className="memory-section">
        <div className="memory-section-head">
          <h3>Loaded memories</h3>
          <span>{active.length} active</span>
        </div>
        <div className="memory-list">
          {active.slice(0, 5).map((item) => (
            <MemoryCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section className="memory-section">
        <div className="memory-section-head">
          <h3>Candidate memories</h3>
          <button type="button" onClick={() => commitCandidates(candidates)} disabled={!candidates.length || saving}>
            Review {candidates.length}
          </button>
        </div>
        <div className="candidate-table">
          <div className="candidate-row header">
            <span>Memory</span>
            <span>Level</span>
            <span>Source</span>
          </div>
          {candidates.slice(0, 5).map((item) => (
            <div className="candidate-row" key={item.id}>
              <span>{item.content}</span>
              <LevelBadge level={item.level} />
              <span>{item.source}</span>
            </div>
          ))}
          {!candidates.length && <p className="empty-copy">暂无候选记忆。</p>}
        </div>
      </section>

      <div className="source-card">
        <span><CheckCircle2 size={16} /> Updated 2 minutes ago</span>
        <code>source: data/memory/memory.md</code>
      </div>
    </aside>
  );
}

function MobileChat(props: WorkbenchProps) {
  const { agentConfig, memoryState, conversation, pendingCandidates, activeMode, setMobileView, updateAgent, chooseMode } = props;
  return (
    <section className="phone-frame">
      <div className="phone-status"><strong>9:41</strong><span>⌁ ◔ ▱</span></div>
      <header className="mobile-header">
        <div>
          <h1>{agentConfig.name}</h1>
          <p><span className="live-dot" />{memoryState.stats.loaded} 条记忆已加载</p>
        </div>
        <div className="mobile-actions">
          <button type="button" onClick={() => setMobileView("settings")}><SlidersHorizontal size={18} /></button>
          <Segmented
            value={agentConfig.language}
            options={[["zh", "中"], ["en", "EN"]]}
            onChange={(value) => updateAgent({ ...agentConfig, language: value as "zh" | "en" })}
          />
        </div>
      </header>
      <div className="mobile-note">
        <BrainCircuit size={20} />
        <span>主页保持纯聊天；角色、模型和记忆管理都在设置页。</span>
      </div>
      <div className="mobile-chat-list">
        {conversation.messages.map((message) => <MessageBubble key={message.id} message={message} compact />)}
      </div>
      <div className="mobile-composer">
        <div className="mobile-quick-actions">
          <button type="button" className={activeMode === "thinking" ? "active" : ""} onClick={() => chooseMode("thinking")}><BrainCircuit size={15} />思考</button>
          <button type="button" className={activeMode === "memory" ? "active" : ""} onClick={() => chooseMode("memory")}><Database size={15} />记忆</button>
          <button type="button" className={activeMode === "tools" ? "active" : ""} onClick={() => chooseMode("tools")}><Wrench size={15} />工具</button>
        </div>
        <ChatPanelMini {...props} />
        <span>{pendingCandidates.length ? `候选记忆 ${pendingCandidates.length} 条` : "候选记忆将在这里提示"}</span>
      </div>
    </section>
  );
}

function ChatPanelMini({ draft, sending, setDraft, sendMessage, handleAttachment }: WorkbenchProps) {
  return (
    <form className="composer mobile" onSubmit={sendMessage}>
      <button type="button" aria-label="附件" onClick={handleAttachment}><Paperclip size={20} /></button>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="发消息，或让智能体记住一件事..." />
      <button className="send-button" type="submit" disabled={sending}>{sending ? <Loader2 className="spin" size={20} /> : <Send size={22} />}</button>
    </form>
  );
}

function MobileSettings(props: WorkbenchProps) {
  const { agentConfig, selectedProvider, setMobileView, pendingCandidates, memoryState, commitCandidates, updateAgent, openPanel } = props;
  return (
    <section className="phone-frame settings">
      <div className="phone-status"><strong>9:41</strong><span>⌁ ◔ ▱</span></div>
      <header className="settings-header">
        <div>
          <span>Memory Workbench</span>
          <h1>Settings</h1>
        </div>
        <button type="button" onClick={() => setMobileView("chat")}><X size={20} /></button>
      </header>
      <div className="settings-stack">
        <div className="mobile-card">
          <h2>Agent identity</h2>
          <MobileSettingRow icon={<Bot size={16} />} label="Agent name" value={agentConfig.name} onClick={() => openPanel("agent")} />
          <MobileSettingRow icon={<CheckCircle2 size={16} />} label="Role" value={agentConfig.roleTitle} onClick={() => openPanel("agent")} />
        </div>
        <div className="mobile-card">
          <h2><SlidersHorizontal size={16} />Behavior switches</h2>
          <ToggleRow
            title="Language"
            subtitle="界面语言 / Display language"
            checked={agentConfig.language === "zh"}
            onChange={(checked) => updateAgent({ ...agentConfig, language: checked ? "zh" : "en" })}
          />
          <ToggleRow
            title="Cite memory"
            subtitle="Show sources in replies"
            checked={agentConfig.behavior.citeMemory}
            onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, citeMemory: checked } })}
          />
          <ToggleRow
            title="Auto-save notes"
            subtitle="Capture durable preferences"
            checked={agentConfig.behavior.autoSaveNotes}
            onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, autoSaveNotes: checked } })}
          />
          <ToggleRow
            title="Strict retrieval"
            subtitle="Use selected memories only"
            checked={agentConfig.behavior.strictRetrieval}
            onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, strictRetrieval: checked } })}
          />
        </div>
        <div className="mobile-card">
          <div className="section-head"><h2>Temperature</h2><span>{agentConfig.temperature.toFixed(1)}</span></div>
          <input
            className="range"
            type="range"
            value={agentConfig.temperature}
            min="0"
            max="1"
            step="0.1"
            onChange={(event) => updateAgent({ ...agentConfig, temperature: Number(event.target.value) })}
          />
        </div>
        <div className="api-strip">
          <Sparkles size={22} />
          <div>
            <strong>{selectedProvider.model}</strong>
            <span>{selectedProvider.apiKeySet ? "Key connected" : "Key missing"} · {Math.round(selectedProvider.contextLength / 1000)}k context</span>
          </div>
        </div>
        <div className="mobile-card">
          <div className="section-head"><h2>Memory management</h2><span>{memoryState.items.length} items</span></div>
          <div className="memory-metrics">
            <Stat value={String(memoryState.stats.loaded)} label="Loaded" />
            <Stat value={String(pendingCandidates.length || memoryState.stats.candidates)} label="Candidates" />
            <Stat value="0" label="Conflicts" />
          </div>
          <div className="mobile-buttons">
            <button type="button" onClick={() => commitCandidates()}><ClipboardList size={16} />Review</button>
            <button type="button" className="blue" onClick={() => openPanel("memory")}><FileText size={16} />memory.md</button>
          </div>
        </div>
        <ModelSettings {...props} compact />
      </div>
    </section>
  );
}

function ModelSettings({ modelConfig, saveModel, testModel, compact }: WorkbenchProps & { compact?: boolean }) {
  const provider = modelConfig.providers[modelConfig.selectedProvider];

  function patchProvider(patch: Partial<ModelProviderConfig>) {
    saveModel({
      ...modelConfig,
      providers: {
        ...modelConfig.providers,
        [modelConfig.selectedProvider]: {
          ...provider,
          ...patch
        }
      }
    });
  }

  return (
    <div className={compact ? "mobile-card model-editor compact" : "model-editor"}>
      <h2>Model provider</h2>
      <select
        value={modelConfig.selectedProvider}
        onChange={(event) => saveModel({ ...modelConfig, selectedProvider: event.target.value as ProviderId })}
      >
        {providerOrder.map((id) => (
          <option key={id} value={id}>{modelConfig.providers[id].label}</option>
        ))}
      </select>
      <label>
        Base URL
        <input value={provider.baseURL} onChange={(event) => patchProvider({ baseURL: event.target.value })} />
      </label>
      <label>
        Model
        <input value={provider.model} onChange={(event) => patchProvider({ model: event.target.value })} />
      </label>
      <label>
        Context length
        <input
          type="number"
          min="1000"
          step="1000"
          value={provider.contextLength}
          onChange={(event) => patchProvider({ contextLength: Math.max(1000, Number(event.target.value) || 64000) })}
        />
      </label>
      <div className="context-presets" aria-label="上下文长度快捷设置">
        {contextLengthOptions.map((value) => (
          <button
            key={value}
            type="button"
            className={provider.contextLength === value ? "active" : ""}
            onClick={() => patchProvider({ contextLength: value })}
          >
            {Math.round(value / 1000)}k
          </button>
        ))}
      </div>
      <label>
        API Key
        <input
          type="password"
          placeholder={provider.apiKeySet ? "已保存，输入新 Key 替换" : "请输入 API Key"}
          onBlur={(event) => {
            if (event.target.value.trim()) patchProvider({ apiKey: event.target.value.trim() });
            event.target.value = "";
          }}
        />
      </label>
      <button type="button" className="test-button" onClick={testModel}>测试连接</button>
    </div>
  );
}

function InteractionPanel(props: WorkbenchProps) {
  const { activePanel, closePanel } = props;
  if (!activePanel) return null;

  const titles: Record<Exclude<ActivePanel, null>, string> = {
    search: "Search workspace",
    settings: "Settings",
    memory: "memory.md",
    tools: "Tools",
    summary: "Conversation summary",
    agent: "Agent identity"
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={titles[activePanel]} onMouseDown={(event) => {
      if (event.target === event.currentTarget) closePanel();
    }}>
      <div className="drawer">
        <header className="drawer-head">
          <div>
            <span>Memory Workbench</span>
            <h2>{titles[activePanel]}</h2>
          </div>
          <button type="button" onClick={closePanel} aria-label="关闭"><X size={20} /></button>
        </header>
        {activePanel === "search" && <SearchPanel {...props} />}
        {activePanel === "settings" && <SettingsPanel {...props} />}
        {activePanel === "memory" && <MemoryDetailPanel {...props} />}
        {activePanel === "tools" && <ToolsPanel {...props} />}
        {activePanel === "summary" && <SummaryPanel {...props} />}
        {activePanel === "agent" && <AgentEditorPanel {...props} />}
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
        <h3>Messages</h3>
        <div className="result-list">
          {messages.map((message) => (
            <div className="result-row" key={message.id}>
              <strong>{message.role === "user" ? "User" : "Agent"}</strong>
              <p>{message.content}</p>
            </div>
          ))}
          {!messages.length && <p className="empty-copy">没有匹配的消息。</p>}
        </div>
      </section>
      <section className="drawer-section">
        <h3>Memories</h3>
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

function SettingsPanel(props: WorkbenchProps) {
  return (
    <div className="drawer-body split-body">
      <AgentEditorPanel {...props} embedded />
      <ModelSettings {...props} compact />
    </div>
  );
}

function AgentEditorPanel({ agentConfig, updateAgent, embedded }: WorkbenchProps & { embedded?: boolean }) {
  return (
    <div className={embedded ? "embedded-editor" : "drawer-body"}>
      <section className="drawer-section">
        <h3>Agent identity</h3>
        <label className="field">
          Agent name
          <input value={agentConfig.name} onChange={(event) => updateAgent({ ...agentConfig, name: event.target.value })} />
        </label>
        <label className="field">
          Role title
          <input value={agentConfig.roleTitle} onChange={(event) => updateAgent({ ...agentConfig, roleTitle: event.target.value })} />
        </label>
        <label className="field">
          Behavior prompt
          <textarea value={agentConfig.roleDescription} onChange={(event) => updateAgent({ ...agentConfig, roleDescription: event.target.value })} />
        </label>
      </section>
      <section className="drawer-section">
        <h3>Behavior</h3>
        <ToggleRow
          title="主动追问"
          subtitle="缺少信息时先确认"
          checked={agentConfig.behavior.proactiveFollowup}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, proactiveFollowup: checked } })}
        />
        <ToggleRow
          title="引用记忆"
          subtitle="回答中显示记忆来源"
          checked={agentConfig.behavior.citeMemory}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, citeMemory: checked } })}
        />
      </section>
    </div>
  );
}

function MemoryDetailPanel({ memoryState, pendingCandidates, saving, commitCandidates, organizeMemory }: WorkbenchProps) {
  const candidates = pendingCandidates.length ? pendingCandidates : memoryState.items.filter((item) => item.status === "candidate");
  return (
    <div className="drawer-body">
      <div className="drawer-actions">
        <button type="button" onClick={organizeMemory}><FileText size={16} />整理 memory.md</button>
        <button type="button" onClick={() => commitCandidates(candidates)} disabled={saving}><ClipboardList size={16} />提交候选 {candidates.length}</button>
      </div>
      <section className="drawer-section">
        <h3>Candidate memories</h3>
        <div className="result-list">
          {candidates.map((item) => (
            <div className="result-row" key={item.id}>
              <strong>{item.level} · {item.type}</strong>
              <p>{item.content}</p>
            </div>
          ))}
          {!candidates.length && <p className="empty-copy">暂无候选记忆。发送包含“记住/偏好/以后/不要”的消息后会生成候选。</p>}
        </div>
      </section>
      <section className="drawer-section">
        <h3>Current memory.md</h3>
        <pre className="markdown-preview">{memoryState.markdown}</pre>
      </section>
    </div>
  );
}

function ToolsPanel({ testModel, organizeMemory, generateSummary, commitCandidates, pendingCandidates, saving, notify }: WorkbenchProps) {
  return (
    <div className="drawer-body">
      <div className="tool-grid">
        <button type="button" onClick={testModel}><CheckCircle2 size={18} /><strong>测试模型连接</strong><span>检查当前供应商 API Key 和模型名。</span></button>
        <button type="button" onClick={organizeMemory}><Database size={18} /><strong>整理长期记忆</strong><span>重写 memory.md 和索引。</span></button>
        <button type="button" onClick={generateSummary}><FileText size={18} /><strong>生成会话摘要</strong><span>基于最近消息生成摘要。</span></button>
        <button type="button" onClick={() => commitCandidates()} disabled={saving}><ClipboardList size={18} /><strong>提交候选记忆</strong><span>{pendingCandidates.length ? `${pendingCandidates.length} 条待提交` : "暂无候选，点击会给出提示。"}</span></button>
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

function MessageBubble({ message, compact = false }: { message: Conversation["messages"][number]; compact?: boolean }) {
  const isUser = message.role === "user";
  return (
    <article className={`message-row ${isUser ? "user" : "assistant"} ${compact ? "compact" : ""}`}>
      {!isUser && (
        <div className="avatar">
          <Bot size={17} />
        </div>
      )}
      <div>
        <div className="bubble">{message.content}</div>
        <small>{isUser ? "" : message.memoryRefs.length ? `引用 ${message.memoryRefs.length} 条记忆` : message.candidateMemoryIds.length ? `候选记忆 ${message.candidateMemoryIds.length} 条` : ""}</small>
      </div>
    </article>
  );
}

function ToggleRow({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{title}</strong>
        <em>{subtitle}</em>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange?: (value: string) => void }) {
  return (
    <div className="segmented">
      {options.map(([optionValue, label]) => (
        <button key={optionValue} type="button" className={value === optionValue ? "active" : ""} onClick={() => onChange?.(optionValue)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return <button className="icon-button" aria-label={label} type="button" onClick={onClick}>{children}</button>;
}

function InfoLine({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  return (
    <div className="info-line">
      <span>{label}</span>
      <strong className={tone || ""}>{value}</strong>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function MemoryCard({ item }: { item: MemoryItem }) {
  return (
    <div className="memory-card">
      <div>
        <strong>{humanizeMemoryType(item.type)}</strong>
        <p>{item.content}</p>
      </div>
      <LevelBadge level={item.level} />
    </div>
  );
}

function LevelBadge({ level }: { level: MemoryItem["level"] }) {
  return <span className={`level ${level}`}>{level === "high" ? "High" : level === "medium" ? "Med" : "Low"}</span>;
}

function MobileSettingRow({ icon, label, value, onClick }: { icon: ReactNode; label: string; value: string; onClick?: () => void }) {
  return (
    <button className="mobile-setting-row" type="button" onClick={onClick}>
      <span>{icon}</span>
      <div>
        <em>{label}</em>
        <strong>{value}</strong>
      </div>
      <ChevronRight size={16} />
    </button>
  );
}

function humanizeMemoryType(type: string) {
  return type
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "操作失败。";
}

interface WorkbenchProps {
  agentConfig: AgentConfig;
  modelConfig: ModelConfig;
  selectedProvider: ModelProviderConfig;
  conversation: Conversation;
  memoryState: MemoryState;
  pendingCandidates: MemoryItem[];
  draft: string;
  saving: boolean;
  sending: boolean;
  status: string;
  error: string;
  activePanel: ActivePanel;
  activeMode: ChatMode;
  generatedSummary: string;
  setDraft: (value: string) => void;
  updateAgent: (config: AgentConfig) => Promise<void>;
  saveModel: (config: ModelConfig) => Promise<void>;
  testModel: () => Promise<void>;
  sendMessage: (event?: FormEvent) => Promise<void>;
  commitCandidates: (items?: MemoryItem[]) => Promise<void>;
  organizeMemory: () => Promise<void>;
  setMobileView: (view: "chat" | "settings") => void;
  openPanel: (panel: Exclude<ActivePanel, null>, message?: string) => void;
  setActivePanel: (panel: ActivePanel) => void;
  closePanel: () => void;
  chooseMode: (mode: ChatMode) => void;
  generateSummary: () => void;
  saveSummaryCandidate: () => void;
  handleAttachment: () => void;
  handleVoice: () => void;
  notify: (message: string) => void;
}

export default App;
