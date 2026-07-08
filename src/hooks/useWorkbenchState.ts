import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, getAdminToken, setAdminToken } from "../api";
import type { AgentConfig, ApiWarning, ChatMessage, Conversation, ConversationSummary, MemoryItem, MemoryState, ModelConfig, RoleStore, WebSearchResponse } from "../types";
import type { ActivePanel, BusyAction, ChatMode, PanelPhase, WorkbenchProps } from "../workbenchTypes";

const panelMotionMs = 240;

export function useWorkbenchState() {
  const [roleStore, setRoleStore] = useState<RoleStore | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [memoryState, setMemoryState] = useState<MemoryState | null>(null);
  const [pendingCandidates, setPendingCandidates] = useState<MemoryItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("就绪");
  const [error, setError] = useState("");
  const [adminToken, setAdminTokenState] = useState(() => getAdminToken());
  const [mobileView, setMobileView] = useState<"chat" | "settings">("chat");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [renderedPanel, setRenderedPanel] = useState<ActivePanel>(null);
  const [panelPhase, setPanelPhase] = useState<PanelPhase>("enter");
  const [activeMode, setActiveMode] = useState<ChatMode>("normal");
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [webSearchState, setWebSearchState] = useState<WebSearchResponse | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [statusKey, setStatusKey] = useState(0);
  const [memoryFeedbackKey, setMemoryFeedbackKey] = useState(0);
  const [memoryPanelCollapsed, setMemoryPanelCollapsed] = useState(false);
  const panelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const [roles, model, activeConversation, conversationList, memory] = await Promise.all([
          api.getRoles(),
          api.getModelConfig(),
          api.getConversation(),
          api.listConversations(),
          api.getMemory()
        ]);
        if (!mounted) return;
        setRoleStore(roles);
        setModelConfig(model);
        setConversation(activeConversation);
        setConversations(conversationList.conversations);
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

  useEffect(() => {
    return () => {
      if (panelCloseTimerRef.current) clearTimeout(panelCloseTimerRef.current);
    };
  }, []);

  const selectedProvider = useMemo(() => {
    if (!modelConfig) return null;
    return modelConfig.providers[modelConfig.selectedProvider];
  }, [modelConfig]);

  const agentConfig = useMemo(() => {
    if (!roleStore || !conversation) return null;
    return roleStore.roles.find((role) => role.id === conversation.roleId) || roleStore.roles.find((role) => role.id === roleStore.selectedRoleId) || roleStore.roles[0] || null;
  }, [roleStore, conversation]);

  function updateAdminToken(value: string) {
    setAdminToken(value);
    setAdminTokenState(value.trim());
    showStatus(value.trim() ? "管理令牌已保存到当前浏览器会话" : "管理令牌已清除");
  }

  async function updateAgent(next: AgentConfig) {
    setSaving(true);
    try {
      const saved = await api.updateRole(next.id, next);
      setRoleStore(saved);
      showStatus("智能体设置已同步");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function createRole(role: Partial<AgentConfig>) {
    setSaving(true);
    setBusyAction("role-save");
    try {
      const saved = await api.createRole(role);
      setRoleStore(saved);
      showStatus("已新增角色预设");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function deleteRole(roleId: string) {
    setSaving(true);
    setBusyAction("role-save");
    try {
      const saved = await api.deleteRole(roleId);
      setRoleStore(saved);
      showStatus("角色预设已删除");
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function selectRole(roleId: string) {
    setSaving(true);
    setBusyAction("role-save");
    try {
      const saved = await api.selectRole(roleId);
      setRoleStore(saved);
      showStatus("已切换默认角色");
    } catch (selectError) {
      setError(errorMessage(selectError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function setConversationRole(roleId: string) {
    if (!conversation) return;
    setSaving(true);
    setBusyAction("role-save");
    try {
      const updated = await api.setConversationRole(conversation.id, roleId);
      setConversation(updated);
      setConversations(await refreshConversationList());
      showStatus("已切换当前会话角色");
    } catch (roleError) {
      setError(errorMessage(roleError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function refreshConversationList() {
    const list = await api.listConversations();
    return list.conversations;
  }

  async function createConversation(options: { title?: string; roleId?: string } = {}) {
    setSaving(true);
    setBusyAction("conversation-switch");
    try {
      const created = await api.createConversation(options);
      setConversation(created);
      setConversations(await refreshConversationList());
      setPendingCandidates([]);
      showStatus("已创建新会话");
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function switchConversation(conversationId: string) {
    if (conversation?.id === conversationId) return;
    setSaving(true);
    setBusyAction("conversation-switch");
    try {
      const next = await api.getConversation(conversationId);
      setConversation(next);
      setPendingCandidates([]);
      showStatus(`已切换到会话「${next.title}」`);
    } catch (switchError) {
      setError(errorMessage(switchError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function deleteConversation(conversationId: string) {
    setSaving(true);
    setBusyAction("conversation-switch");
    try {
      await api.deleteConversation(conversationId);
      const list = await refreshConversationList();
      setConversations(list);
      if (conversation?.id === conversationId) {
        const fallback = list[0];
        if (fallback) setConversation(await api.getConversation(fallback.id));
      }
      showStatus("会话已删除");
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function saveModel(next: ModelConfig) {
    setModelConfig(next);
    setSaving(true);
    try {
      const saved = await api.saveModelConfig(next);
      setModelConfig(saved);
      showStatus("模型设置已同步");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function testModel() {
    setSaving(true);
    setBusyAction("model-test");
    try {
      const result = await api.testModel();
      showStatus(`模型返回：${result.message}`);
      setModelConfig(await api.getModelConfig());
    } catch (testError) {
      setError(errorMessage(testError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  function appendMessageDelta(conversationId: string, serverMessageId: string, fallbackMessageId: string, delta: string) {
    setConversation((current) => {
      if (!current || current.id !== conversationId) return current;
      return {
        ...current,
        messages: current.messages.map((message) => {
          if (message.id !== serverMessageId && message.id !== fallbackMessageId) return message;
          return { ...message, content: `${message.content}${delta}` };
        })
      };
    });
  }

  function setAssistantCandidateIds(conversationId: string, messageId: string, candidateIds: string[]) {
    setConversation((current) => {
      if (!current || current.id !== conversationId) return current;
      return {
        ...current,
        messages: current.messages.map((message) => (message.id === messageId ? { ...message, candidateMemoryIds: candidateIds } : message))
      };
    });
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || sending || !conversation) return;
    const activeConversation = conversation;
    const localUserMessage = createLocalMessage("user", content);
    const localAssistantMessage = createLocalMessage("assistant", "");
    setDraft("");
    setSending(true);
    setError("");
    setConversation({
      ...activeConversation,
      messages: [...activeConversation.messages, localUserMessage, localAssistantMessage],
      updatedAt: new Date().toISOString()
    });
    showStatus("正在流式生成回复...");
    try {
      const useWebSearch = activeMode === "web";
      let finalRelevantMemories = 0;
      let finalWebSearchResultCount: number | null = null;
      let finalWebSearchErrorMessage = "";
      let serverReplyId = localAssistantMessage.id;
      await api.streamChat(content, activeMode, useWebSearch, activeConversation.id, (eventName, data) => {
        if (eventName === "message.delta") {
          const payload = data as { delta?: string };
          if (payload.delta) appendMessageDelta(activeConversation.id, serverReplyId, localAssistantMessage.id, payload.delta);
          return;
        }
        if (eventName === "message.done") {
          const payload = data as {
            reply: ChatMessage;
            conversation: Conversation;
            relevantMemories?: MemoryItem[];
            webSearch?: WebSearchResponse | null;
            webSearchError?: ApiWarning | null;
          };
          serverReplyId = payload.reply.id;
          finalRelevantMemories = payload.relevantMemories?.length || 0;
          finalWebSearchResultCount = payload.webSearch?.results.length ?? null;
          finalWebSearchErrorMessage = payload.webSearchError?.message || finalWebSearchErrorMessage;
          setConversation(payload.conversation);
          setWebSearchState(payload.webSearch || null);
          return;
        }
        if (eventName === "memory.candidates") {
          const payload = data as {
            conversation?: Conversation;
            replyId?: string;
            candidates?: MemoryItem[];
            candidateExtractionError?: ApiWarning | null;
          };
          if (payload.conversation) {
            setConversation(payload.conversation);
          } else if (payload.replyId && payload.candidates?.length) {
            setAssistantCandidateIds(activeConversation.id, payload.replyId, payload.candidates.map((item) => item.id));
          }
          if (payload.candidates?.length) {
            setPendingCandidates((current) => mergePendingCandidates(payload.candidates!, current));
            showStatus(`候选记忆 ${payload.candidates.length} 条已生成，等待确认。`);
          } else if (payload.candidateExtractionError) {
            showStatus(`回复已完成，候选记忆抽取失败：${payload.candidateExtractionError.message}`);
          }
          return;
        }
        if (eventName === "web.search_error") {
          finalWebSearchErrorMessage = (data as ApiWarning).message || "联网搜索不可用。";
          return;
        }
        if (eventName === "error") {
          const payload = data as ApiWarning;
          throw new Error(payload.message || "流式输出失败。");
        }
      });
      setConversations(await refreshConversationList());
      setMemoryState(await api.getMemory());
      if (finalWebSearchErrorMessage) {
        showStatus(`联网搜索不可用，已降级回答：${finalWebSearchErrorMessage}`);
      } else if (finalWebSearchResultCount !== null) {
        showStatus(`联网搜索 ${finalWebSearchResultCount} 条结果 · ${finalRelevantMemories ? `加载 ${finalRelevantMemories} 条记忆` : "未匹配记忆"}`);
      } else {
        showStatus(finalRelevantMemories ? `加载 ${finalRelevantMemories} 条记忆` : "未匹配记忆");
      }
    } catch (chatError) {
      setError(errorMessage(chatError));
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  async function commitCandidates(items = pendingCandidates) {
    if (!items.length) {
      openPanel("memory", "暂无候选记忆可提交。");
      return;
    }
    setSaving(true);
    setBusyAction("memory-commit");
    try {
      const result = await api.commitMemory(items);
      const memory = await api.getMemory();
      const committedIds = new Set(items.map((item) => item.id));
      setMemoryState(memory);
      setPendingCandidates((current) => current.filter((item) => !committedIds.has(item.id)));
      setMemoryFeedbackKey((key) => key + 1);
      showStatus(`已保存到 ${result.rawPath}`);
    } catch (commitError) {
      setError(errorMessage(commitError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function updateMemoryItem(memoryId: string, patch: Partial<MemoryItem>) {
    setSaving(true);
    setBusyAction("memory-commit");
    try {
      await api.updateMemoryItem(memoryId, patch);
      const memory = await api.getMemory();
      setMemoryState(memory);
      if (patch.status === "disabled") {
        setPendingCandidates((current) => current.filter((item) => item.id !== memoryId));
      } else {
        setPendingCandidates((current) => current.map((item) => (item.id === memoryId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)));
      }
      setMemoryFeedbackKey((key) => key + 1);
      showStatus("记忆已更新");
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function rejectMemoryItem(memoryId: string) {
    await updateMemoryItem(memoryId, { status: "disabled" });
    showStatus("候选记忆已拒绝");
  }

  async function editMemoryItem(item: MemoryItem) {
    const nextContent = window.prompt("编辑记忆内容", item.content);
    if (nextContent === null) return;
    const content = nextContent.trim();
    if (!content) {
      notify("记忆内容不能为空。");
      return;
    }
    await updateMemoryItem(item.id, { content });
  }

  async function organizeMemory() {
    setSaving(true);
    setBusyAction("memory-organize");
    try {
      await api.organizeMemory();
      setMemoryState(await api.getMemory());
      setMemoryFeedbackKey((key) => key + 1);
      showStatus("memory.md 已整理");
    } catch (organizeError) {
      setError(errorMessage(organizeError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function runWebSearch(query: string) {
    if (!query.trim()) {
      notify("请输入搜索关键词。");
      return null;
    }
    setSaving(true);
    setBusyAction("web-search");
    try {
      const result = await api.webSearch(query);
      setWebSearchState(result);
      showStatus(`联网搜索完成：${result.results.length} 条结果。`);
      return result;
    } catch (searchError) {
      setError(errorMessage(searchError));
      return null;
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  function showStatus(message: string) {
    setStatus(message);
    setStatusKey((key) => key + 1);
    setError("");
  }

  function notify(message: string) {
    showStatus(message);
  }

  function openPanel(panel: Exclude<ActivePanel, null>, message?: string) {
    if (panelCloseTimerRef.current) {
      clearTimeout(panelCloseTimerRef.current);
      panelCloseTimerRef.current = null;
    }
    setActivePanel(panel);
    setRenderedPanel(panel);
    setPanelPhase("enter");
    if (message) notify(message);
  }

  function closePanel() {
    const closingPanel = activePanel || renderedPanel;
    if (!closingPanel || panelPhase === "exit") return;
    setPanelPhase("exit");
    if ((closingPanel === "memory" && activeMode === "memory") || (closingPanel === "tools" && activeMode === "tools")) {
      setActiveMode("normal");
      notify("已回到普通对话模式。");
    }
    if (panelCloseTimerRef.current) clearTimeout(panelCloseTimerRef.current);
    panelCloseTimerRef.current = setTimeout(() => {
      setActivePanel(null);
      setRenderedPanel(null);
      setPanelPhase("enter");
      panelCloseTimerRef.current = null;
    }, panelMotionMs);
  }

  function chooseMode(mode: ChatMode) {
    if (activeMode === mode) {
      const pairedPanel = mode === "memory" ? "memory" : mode === "tools" ? "tools" : mode === "web" ? "webSearch" : null;
      if (pairedPanel && activePanel === pairedPanel) {
        if (mode === "web") {
          setActiveMode("normal");
          notify("已回到普通对话模式。");
        }
        closePanel();
        return;
      }
      setActiveMode("normal");
      notify("已回到普通对话模式。");
      return;
    }
    setActiveMode(mode);
    const labels: Record<ChatMode, string> = {
      normal: "普通对话模式",
      thinking: "深度思考模式已启用，下一条消息会要求先分析再回答。",
      memory: "记忆整理模式已启用，下一条消息会优先识别候选记忆。",
      tools: "工具模式已启用，可从工具面板触发本地动作。",
      web: "联网搜索模式已启用，下一条消息会先搜索网络再回答。"
    };
    notify(labels[mode]);
    if (mode === "tools") openPanel("tools");
    if (mode === "memory") openPanel("memory");
    if (mode === "web") openPanel("webSearch");
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
    openPanel("summary");
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
    setPendingCandidates((current) => mergePendingCandidates([candidate], current));
    openPanel("memory");
    notify("摘要已加入候选记忆。");
  }

  function handleAttachment() {
    openPanel("tools", "附件入口已响应；第一版先通过工具面板管理本地动作。");
  }

  function handleVoice() {
    if (!draft.trim()) setDraft("请把这段语音内容整理成文字：");
    notify("语音入口已响应；已在输入框放入语音整理提示。");
  }

  function toggleMemoryPanel() {
    setMemoryPanelCollapsed((current) => !current);
  }

  if (loading || !agentConfig || !roleStore || !modelConfig || !conversation || !memoryState || !selectedProvider) {
    return { loading: true as const };
  }

  const props: WorkbenchProps = {
    agentConfig,
    roleStore,
    modelConfig,
    selectedProvider,
    conversation,
    conversations,
    memoryState,
    pendingCandidates,
    draft,
    saving,
    sending,
    status,
    error,
    adminToken,
    activePanel,
    renderedPanel,
    panelPhase,
    activeMode,
    generatedSummary,
    webSearchState,
    busyAction,
    statusKey,
    memoryFeedbackKey,
    memoryPanelCollapsed,
    setDraft,
    updateAdminToken,
    updateAgent,
    createRole,
    deleteRole,
    selectRole,
    saveModel,
    testModel,
    sendMessage,
    commitCandidates,
    updateMemoryItem,
    rejectMemoryItem,
    editMemoryItem,
    organizeMemory,
    runWebSearch,
    setMobileView,
    openPanel,
    closePanel,
    chooseMode,
    generateSummary,
    saveSummaryCandidate,
    handleAttachment,
    handleVoice,
    notify,
    createConversation,
    switchConversation,
    deleteConversation,
    setConversationRole,
    toggleMemoryPanel
  };

  return { loading: false as const, props, mobileView };
}

function createLocalMessage(role: "user" | "assistant", content: string): ChatMessage {
  return {
    id: `local-${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
    memoryRefs: [],
    candidateMemoryIds: []
  };
}

function mergePendingCandidates(nextItems: MemoryItem[], currentItems: MemoryItem[]) {
  const byId = new Map<string, MemoryItem>();
  for (const item of [...nextItems, ...currentItems]) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "操作失败。";
}
