import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, getAdminToken, setAdminToken } from "../api";
import { getUiText } from "../i18n";
import type { AgentConfig, AgentTask, AgentTool, ApiWarning, ChatMessage, Conversation, ConversationSearchResult, ConversationSummary, ExpertTeam, ExpertTeamStore, MemoryItem, MemoryState, ModelConfig, RoleStore, WebSearchResponse } from "../types";
import type { ActivePanel, BusyAction, ChatMode, PanelPhase, WorkbenchProps } from "../workbenchTypes";

const panelMotionMs = 240;

export function useWorkbenchState() {
  const [roleStore, setRoleStore] = useState<RoleStore | null>(null);
  const [teamStore, setTeamStore] = useState<ExpertTeamStore | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [memoryState, setMemoryState] = useState<MemoryState | null>(null);
  const [pendingCandidates, setPendingCandidates] = useState<MemoryItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [bootVersion, setBootVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
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
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [statusKey, setStatusKey] = useState(0);
  const [memoryFeedbackKey, setMemoryFeedbackKey] = useState(0);
  const [memoryPanelCollapsed, setMemoryPanelCollapsed] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const panelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const languageRef = useRef<AgentConfig["language"] | null>(null);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const [roles, teams, model, activeConversation, conversationList, memory, toolList, taskList] = await Promise.all([
          api.getRoles(),
          api.getTeams(),
          api.getModelConfig(),
          api.getConversation(),
          api.listConversations(),
          api.getMemory(),
          api.listTools(),
          api.listTasks()
        ]);
        if (!mounted) return;
        setRoleStore(roles);
        setTeamStore(teams);
        setModelConfig(model);
        // Empty conversation stays on the welcome screen until the user sends the first message
        setHasStarted(activeConversation.messages.length > 0);
        setConversation(activeConversation);
        setConversations(conversationList.conversations);
        setMemoryState(memory);
        setTools(toolList.tools);
        setWorkspaceRoot(toolList.workspaceRoot || "");
        setTasks(taskList.tasks);
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
  }, [bootVersion]);

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

  const text = useMemo(() => getUiText(agentConfig?.language), [agentConfig?.language]);

  useEffect(() => {
    if (!agentConfig) return;
    if (languageRef.current === agentConfig.language) return;
    languageRef.current = agentConfig.language;
    setStatus(getUiText(agentConfig.language).status.ready);
    setStatusKey((key) => key + 1);
  }, [agentConfig?.language]);

  useEffect(() => {
    if (!agentConfig?.accentColor) return;
    document.documentElement.style.setProperty("--accent", agentConfig.accentColor);
  }, [agentConfig?.accentColor]);

  useEffect(() => {
    if (agentConfig?.backgroundImage) {
      document.documentElement.style.setProperty("--app-background-image", `url(${JSON.stringify(agentConfig.backgroundImage)})`);
      return;
    }
    document.documentElement.style.removeProperty("--app-background-image");
  }, [agentConfig?.backgroundImage]);

  // Inject default accent color on boot
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", agentConfig?.accentColor || "#6366f1");
  }, []);

  function updateAdminToken(value: string) {
    setAdminToken(value);
    setAdminTokenState(value.trim());
    setError("");
    setLoading(true);
    setBootVersion((version) => version + 1);
    showStatus(value.trim() ? text.status.adminTokenSaved : text.status.adminTokenCleared);
  }

  function retryBoot() {
    setError("");
    setLoading(true);
    setBootVersion((version) => version + 1);
  }

  async function updateAgent(next: AgentConfig) {
    const languageOnly = agentConfig ? isOnlyLanguageChange(agentConfig, next) : false;
    if (languageOnly) applyLocalRole(next);
    setSaving(true);
    try {
      const saved = await api.updateRole(next.id, next);
      setRoleStore(saved);
      showStatus(text.status.agentSynced);
    } catch (saveError) {
      if (languageOnly) {
        showStatus(getUiText(next.language).status.languageLocalOnly);
      } else {
        setError(errorMessage(saveError));
      }
    } finally {
      setSaving(false);
    }
  }

  async function uploadRoleBackground(file: File) {
    if (!agentConfig) return;
    setSaving(true);
    setBusyAction("role-save");
    setError("");
    try {
      const saved = await api.uploadRoleBackground(agentConfig.id, file);
      setRoleStore(saved);
      showStatus(agentConfig.language === "en" ? "Background updated" : "背景已更新");
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function resetRoleBackground() {
    if (!agentConfig) return;
    setSaving(true);
    setBusyAction("role-save");
    setError("");
    try {
      const saved = await api.resetRoleBackground(agentConfig.id);
      setRoleStore(saved);
      showStatus(agentConfig.language === "en" ? "Default background restored" : "已恢复默认蓝色背景");
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  function applyLocalRole(next: AgentConfig) {
    setRoleStore((current) => {
      if (!current) return current;
      return {
        ...current,
        roles: current.roles.map((role) => (role.id === next.id ? next : role))
      };
    });
  }

  async function createRole(role: Partial<AgentConfig>) {
    setSaving(true);
    setBusyAction("role-save");
    try {
      const saved = await api.createRole(role);
      setRoleStore(saved);
      showStatus(text.status.roleCreated);
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
      showStatus(text.status.roleDeleted);
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
      showStatus(text.status.defaultRoleChanged);
    } catch (selectError) {
      setError(errorMessage(selectError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function createTeam(team: Pick<ExpertTeam, "name" | "goal" | "enabled" | "leadRoleId" | "memberRoleIds">) {
    setSaving(true);
    setBusyAction("team-save");
    setError("");
    try {
      setTeamStore(await api.createTeam(team));
      showStatus(agentConfig?.language === "en" ? "Expert team created" : "专家团已创建");
    } catch (teamError) {
      setError(errorMessage(teamError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function updateTeam(teamId: string, team: Pick<ExpertTeam, "name" | "goal" | "enabled" | "leadRoleId" | "memberRoleIds">) {
    setSaving(true);
    setBusyAction("team-save");
    setError("");
    try {
      setTeamStore(await api.updateTeam(teamId, team));
      showStatus(agentConfig?.language === "en" ? "Expert team saved" : "专家团配置已保存");
    } catch (teamError) {
      setError(errorMessage(teamError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function selectTeam(teamId: string) {
    try {
      setTeamStore(await api.selectTeam(teamId));
    } catch (teamError) {
      setError(errorMessage(teamError));
    }
  }

  async function deleteTeam(teamId: string) {
    setSaving(true);
    setBusyAction("team-save");
    setError("");
    try {
      setTeamStore(await api.deleteTeam(teamId));
      showStatus(agentConfig?.language === "en" ? "Expert team deleted" : "专家团已删除");
    } catch (teamError) {
      setError(errorMessage(teamError));
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
      showStatus(text.status.conversationRoleChanged);
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
      setHasStarted(Boolean(created.messages && created.messages.length > 0));
      setConversations(await refreshConversationList());
      setTasks([]);
      setPendingCandidates([]);
      showStatus(text.status.conversationCreated);
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
      setHasStarted(next.messages.length > 0);
      setTasks((await api.listTasks(conversationId)).tasks);
      setPendingCandidates([]);
      showStatus(agentConfig?.language === "en" ? `Switched to conversation "${next.title}"` : `已切换到会话「${next.title}」`);
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
        if (fallback) {
          setConversation(await api.getConversation(fallback.id));
          setTasks((await api.listTasks(fallback.id)).tasks);
        }
      }
      showStatus(text.status.conversationDeleted);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function updateConversationMetadata(conversationId: string, patch: { title?: string; starred?: boolean }) {
    setSaving(true);
    setBusyAction("conversation-update");
    try {
      const updated = await api.updateConversation(conversationId, patch);
      if (conversation?.id === conversationId) setConversation(updated);
      setConversations(await refreshConversationList());
      showStatus(agentConfig?.language === "en" ? "Conversation updated" : "会话已更新");
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function renameConversation(conversationId: string, title: string) {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;
    await updateConversationMetadata(conversationId, { title: normalizedTitle });
  }

  async function toggleConversationStarred(conversationId: string, starred: boolean) {
    await updateConversationMetadata(conversationId, { starred });
  }

  async function exportConversation(conversationId: string, format: "markdown" | "txt" | "json" = "markdown") {
    try {
      const content = await api.exportConversation(conversationId, format);
      const title = conversations.find((item) => item.id === conversationId)?.title || conversation?.title || "conversation";
      const extension = format === "markdown" ? "md" : format;
      downloadText(content, `${sanitizeDownloadName(title)}.${extension}`, format === "json" ? "application/json" : "text/plain");
      showStatus(agentConfig?.language === "en" ? "Conversation exported" : "会话已导出");
    } catch (exportError) {
      setError(errorMessage(exportError));
    }
  }

  async function searchConversations(query: string): Promise<ConversationSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];
    try {
      return (await api.searchConversations(normalizedQuery)).results;
    } catch (searchError) {
      setError(errorMessage(searchError));
      return [];
    }
  }

  async function saveModel(next: ModelConfig) {
    setModelConfig(next);
    setSaving(true);
    try {
      const saved = await api.saveModelConfig(next);
      setModelConfig(saved);
      showStatus(text.status.modelSynced);
      return true;
    } catch (saveError) {
      setError(errorMessage(saveError));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function testModel() {
    setSaving(true);
    setBusyAction("model-test");
    try {
      const result = await api.testModel();
      showStatus(agentConfig?.language === "en" ? `Model replied: ${result.message}` : `模型返回：${result.message}`);
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
    const isFirstMessage = !hasStarted && activeConversation.messages.length === 0;
    const localUserMessage = createLocalMessage("user", content);
    const localAssistantMessage = createLocalMessage("assistant", "");
    const baseMessages = isFirstMessage ? [createGreetingMessage(agentConfig)] : activeConversation.messages;
    setDraft("");
    setSending(true);
    setError("");
    if (isFirstMessage) setHasStarted(true);
    setConversation({
      ...activeConversation,
      messages: [...baseMessages, localUserMessage, localAssistantMessage],
      updatedAt: new Date().toISOString()
    });
    showStatus(text.status.streaming);
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
            showStatus(agentConfig?.language === "en" ? `${payload.candidates.length} memory candidate${payload.candidates.length === 1 ? "" : "s"} generated for review.` : `候选记忆 ${payload.candidates.length} 条已生成，等待确认。`);
          } else if (payload.candidateExtractionError) {
            showStatus(agentConfig?.language === "en" ? `Reply completed. Memory extraction failed: ${payload.candidateExtractionError.message}` : `回复已完成，候选记忆抽取失败：${payload.candidateExtractionError.message}`);
          }
          return;
        }
        if (eventName === "web.search_error") {
          finalWebSearchErrorMessage = (data as ApiWarning).message || text.status.webSearchUnavailable;
          return;
        }
        if (eventName === "error") {
          const payload = data as ApiWarning;
          throw new Error(payload.message || text.status.streamFailed);
        }
      });
      setConversations(await refreshConversationList());
      setMemoryState(await api.getMemory());
      if (finalWebSearchErrorMessage) {
        showStatus(agentConfig?.language === "en" ? `Web search unavailable; answered normally: ${finalWebSearchErrorMessage}` : `联网搜索不可用，已降级回答：${finalWebSearchErrorMessage}`);
      } else if (finalWebSearchResultCount !== null) {
        showStatus(agentConfig?.language === "en"
          ? `Web search found ${finalWebSearchResultCount} result${finalWebSearchResultCount === 1 ? "" : "s"} · ${finalRelevantMemories ? `loaded ${finalRelevantMemories} memor${finalRelevantMemories === 1 ? "y" : "ies"}` : "no matched memory"}`
          : `联网搜索 ${finalWebSearchResultCount} 条结果 · ${finalRelevantMemories ? `加载 ${finalRelevantMemories} 条记忆` : "未匹配记忆"}`);
      } else {
        showStatus(agentConfig?.language === "en" ? (finalRelevantMemories ? `Loaded ${finalRelevantMemories} memor${finalRelevantMemories === 1 ? "y" : "ies"}` : "No matched memory") : (finalRelevantMemories ? `加载 ${finalRelevantMemories} 条记忆` : "未匹配记忆"));
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
      openPanel("memory", text.status.noMemoryCandidates);
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
      showStatus(agentConfig?.language === "en" ? `Saved to ${result.rawPath}` : `已保存到 ${result.rawPath}`);
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
      showStatus(text.status.memoryUpdated);
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function deleteMemoryItem(memoryId: string) {
    setSaving(true);
    setBusyAction("memory-commit");
    try {
      await api.deleteMemoryItem(memoryId);
      const memory = await api.getMemory();
      setMemoryState(memory);
      setPendingCandidates((current) => current.filter((item) => item.id !== memoryId));
      setMemoryFeedbackKey((key) => key + 1);
      showStatus(agentConfig?.language === "en" ? "Memory deleted" : "记忆已删除");
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function rejectMemoryItem(memoryId: string) {
    await updateMemoryItem(memoryId, { status: "disabled" });
    showStatus(text.status.candidateRejected);
  }

  async function editMemoryItem(item: MemoryItem) {
    const nextContent = window.prompt(agentConfig?.language === "en" ? "Edit memory content" : "编辑记忆内容", item.content);
    if (nextContent === null) return;
    const content = nextContent.trim();
    if (!content) {
      notify(text.status.memoryEmpty);
      return;
    }
    const nextType = window.prompt(
      agentConfig?.language === "en" ? "Memory type: user_preference / project_fact / conversation_summary" : "记忆类型：user_preference / project_fact / conversation_summary",
      item.type
    );
    if (nextType === null) return;
    const type = normalizeMemoryType(nextType, item.type);
    const nextLevel = window.prompt(agentConfig?.language === "en" ? "Level: high / medium / low" : "等级：high / medium / low", item.level);
    if (nextLevel === null) return;
    const level = normalizeMemoryLevel(nextLevel, item.level);
    await updateMemoryItem(item.id, { content, type, level });
  }

  async function organizeMemory() {
    setSaving(true);
    setBusyAction("memory-organize");
    try {
      const result = await api.organizeMemory();
      const memory = await api.getMemory();
      setMemoryState(memory);
      if (result.candidates?.length) {
        setPendingCandidates((current) => mergePendingCandidates(result.candidates, current));
      }
      setMemoryFeedbackKey((key) => key + 1);
      showStatus(result.candidates?.length
        ? agentConfig?.language === "en"
          ? `Organize created ${result.candidates.length} review candidate${result.candidates.length === 1 ? "" : "s"}.`
          : `整理生成 ${result.candidates.length} 条待审核候选。`
        : text.status.memoryOrganized);
    } catch (organizeError) {
      setError(errorMessage(organizeError));
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function runWebSearch(query: string) {
    if (!query.trim()) {
      notify(text.status.searchKeywordRequired);
      return null;
    }
    setSaving(true);
    setBusyAction("web-search");
    try {
      const result = await api.webSearch(query);
      setWebSearchState(result);
      showStatus(agentConfig?.language === "en" ? `Web search complete: ${result.results.length} result${result.results.length === 1 ? "" : "s"}.` : `联网搜索完成：${result.results.length} 条结果。`);
      return result;
    } catch (searchError) {
      setError(errorMessage(searchError));
      return null;
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function runTool(toolId: string, objective: string, input: Record<string, unknown>) {
    if (!conversation) return null;
    const normalizedObjective = objective.trim();
    if (!normalizedObjective) {
      notify(agentConfig?.language === "en" ? "Enter a task objective." : "请输入任务目标。");
      return null;
    }
    setSaving(true);
    setBusyAction("tool-run");
    setError("");
    try {
      const task = await api.executeTool(toolId, {
        objective: normalizedObjective,
        conversationId: conversation.id,
        input
      });
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      const step = task.steps[task.steps.length - 1];
      const maybeSearch = step?.result?.data as WebSearchResponse | undefined;
      if (toolId === "web.search" && maybeSearch?.results) {
        setWebSearchState(maybeSearch);
      }
      showStatus(task.status === "completed"
        ? step?.result?.summary || (agentConfig?.language === "en" ? "Tool completed." : "工具执行完成。")
        : task.status === "waiting_approval"
          ? (agentConfig?.language === "en" ? "Task awaits your approval." : "任务已创建，等待确认执行。")
          : step?.error?.message || (agentConfig?.language === "en" ? "Tool execution failed." : "工具执行失败。"));
      return task;
    } catch (toolError) {
      setError(errorMessage(toolError));
      return null;
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function updateTask(action: "approve" | "cancel", taskId: string) {
    setSaving(true);
    setBusyAction("tool-run");
    setError("");
    try {
      const task = action === "approve" ? await api.approveTask(taskId) : await api.cancelTask(taskId);
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      const step = task.steps[task.steps.length - 1];
      showStatus(step?.result?.summary || step?.error?.message || (action === "approve"
        ? (agentConfig?.language === "en" ? "Task approved." : "任务已批准执行。")
        : (agentConfig?.language === "en" ? "Task cancelled." : "任务已取消。")));
      return task;
    } catch (taskError) {
      setError(errorMessage(taskError));
      return null;
    } finally {
      setSaving(false);
      setBusyAction(null);
    }
  }

  async function approveTask(taskId: string) {
    return await updateTask("approve", taskId);
  }

  async function cancelTask(taskId: string) {
    return await updateTask("cancel", taskId);
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
      notify(text.status.normalMode);
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
      setActiveMode("normal");
      notify(text.status.normalMode);
      if (pairedPanel && activePanel === pairedPanel) {
        closePanel();
        return;
      }
      return;
    }
    setActiveMode(mode);
    notify(text.status.modeLabels[mode]);
    if (mode === "tools") openPanel("tools");
    if (mode === "web") openPanel("webSearch");
  }

  async function generateSummary() {
    if (!conversation) return;
    try {
      const result = await api.generateSummary(conversation.id);
      setGeneratedSummary(result.summary);
      openPanel("summary");
      notify(text.status.summaryGenerated);
    } catch (summaryError) {
      setError(errorMessage(summaryError));
      notify(agentConfig?.language === "en" ? "Failed to generate summary" : "摘要生成失败");
    }
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
    notify(text.status.summaryCandidateSaved);
  }

  function handleAttachment() {
    openPanel("tools", text.status.attachmentReady);
  }

  function handleVoice() {
    if (!draft.trim()) setDraft(text.status.voicePrompt);
    notify(text.status.voiceReady);
  }

  function toggleMemoryPanel() {
    setMemoryPanelCollapsed((current) => !current);
  }

  async function regenerateMessage() {
    if (!conversation || isRegenerating) return;
    const messages = conversation.messages;
    const lastUserIndex = [...messages].reverse().findIndex((message) => message.role === "user");
    if (lastUserIndex === -1) return;
    const lastUserMsg = messages[messages.length - 1 - lastUserIndex];
    if (!lastUserMsg.content.trim()) return;
    setIsRegenerating(true);
    setError("");
    const activeConversation = conversation;
    const localAssistantMessage = createLocalMessage("assistant", "");
    const messagesWithoutLastAssistant = lastUserIndex === 0
      ? messages.slice(0, -1)
      : messages.slice(0, messages.length - lastUserIndex);
    setConversation({
      ...activeConversation,
      messages: [...messagesWithoutLastAssistant, localAssistantMessage],
      updatedAt: new Date().toISOString()
    });
    showStatus(text.status.streaming);
    try {
      const useWebSearch = activeMode === "web";
      let serverReplyId = localAssistantMessage.id;
      await api.streamChat(lastUserMsg.content, activeMode, useWebSearch, activeConversation.id, (eventName, data) => {
        if (eventName === "message.delta") {
          const payload = data as { delta?: string };
          if (payload.delta) appendMessageDelta(activeConversation.id, serverReplyId, localAssistantMessage.id, payload.delta);
          return;
        }
        if (eventName === "message.done") {
          const payload = data as {
            reply: ChatMessage;
            conversation: Conversation;
          };
          serverReplyId = payload.reply.id;
          setConversation(payload.conversation);
          return;
        }
        if (eventName === "error") {
          const payload = data as ApiWarning;
          throw new Error(payload.message || text.status.streamFailed);
        }
      });
      setConversations(await refreshConversationList());
      showStatus(agentConfig?.language === "en" ? "Reply regenerated" : "回复已重新生成");
    } catch (chatError) {
      setError(errorMessage(chatError));
    } finally {
      setIsRegenerating(false);
    }
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      notify(agentConfig?.language === "en" ? "Copied" : getUiText("zh").companion.copySuccess);
    } catch {
      notify("复制失败");
    }
  }

  if (loading) {
    return { loading: true as const };
  }

  if (!agentConfig || !roleStore || !teamStore || !modelConfig || !conversation || !memoryState || !selectedProvider) {
    return {
      loading: false as const,
      setupRequired: true as const,
      adminToken,
      error,
      updateAdminToken,
      retryBoot
    };
  }

  const props: WorkbenchProps = {
    agentConfig,
    roleStore,
    teamStore,
    modelConfig,
    selectedProvider,
    conversation,
    conversations,
    memoryState,
    pendingCandidates,
    draft,
    saving,
    sending,
    hasStarted,
    status,
    error,
    adminToken,
    activePanel,
    renderedPanel,
    panelPhase,
    activeMode,
    generatedSummary,
    webSearchState,
    tools,
    tasks,
    workspaceRoot,
    busyAction,
    statusKey,
    memoryFeedbackKey,
    memoryPanelCollapsed,
    setDraft,
    updateAdminToken,
    updateAgent,
    uploadRoleBackground,
    resetRoleBackground,
    createRole,
    deleteRole,
    selectRole,
    createTeam,
    updateTeam,
    selectTeam,
    deleteTeam,
    saveModel,
    testModel,
    sendMessage,
    commitCandidates,
    updateMemoryItem,
    deleteMemoryItem,
    rejectMemoryItem,
    editMemoryItem,
    organizeMemory,
    runWebSearch,
    runTool,
    approveTask,
    cancelTask,
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
    renameConversation,
    toggleConversationStarred,
    exportConversation,
    searchConversations,
    setConversationRole,
    toggleMemoryPanel,
    regenerateMessage,
    copyMessage,
    isRegenerating
  };

  return { loading: false as const, setupRequired: false as const, props, mobileView };
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

function createGreetingMessage(role: AgentConfig | null): ChatMessage {
  const greetingText = role?.greeting || (role?.language === "en" ? getUiText("en").companion.greeting.default : getUiText("zh").companion.greeting.default);
  return {
    id: `local-greeting-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    content: greetingText,
    timestamp: new Date().toISOString(),
    memoryRefs: [],
    candidateMemoryIds: []
  };
}

function sanitizeDownloadName(value: string) {
  return String(value || "conversation").replace(/[\\/:*?"<>|]/g, "-").trim() || "conversation";
}

function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function mergePendingCandidates(nextItems: MemoryItem[], currentItems: MemoryItem[]) {
  const byId = new Map<string, MemoryItem>();
  for (const item of [...nextItems, ...currentItems]) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

function isOnlyLanguageChange(previous: AgentConfig, next: AgentConfig) {
  return previous.id === next.id
    && previous.name === next.name
    && previous.roleTitle === next.roleTitle
    && previous.roleDescription === next.roleDescription
    && previous.temperature === next.temperature
    && JSON.stringify(previous.behavior) === JSON.stringify(next.behavior)
    && previous.language !== next.language;
}

function normalizeMemoryType(value: string, fallback: string) {
  const normalized = value.trim();
  return ["user_preference", "project_fact", "conversation_summary"].includes(normalized) ? normalized : fallback;
}

function normalizeMemoryLevel(value: string, fallback: MemoryItem["level"]) {
  const normalized = value.trim();
  return ["high", "medium", "low"].includes(normalized) ? normalized as MemoryItem["level"] : fallback;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return getUiText().status.operationFailed;
}
