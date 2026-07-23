import type { ActivePanel, ChatMode } from "./workbenchTypes";

export type UiLanguage = "zh" | "en";

export const copy = {
  zh: {
    app: {
      loading: "正在加载 Memory Agent..."
    },
    common: {
      close: "关闭",
      save: "保存",
      clear: "清除",
      edit: "编辑",
      accept: "接受",
      reject: "拒绝",
      add: "新增",
      update: "更新",
      user: "用户",
      assistant: "智能体",
      noSummary: "还没有生成摘要。"
    },
    status: {
      ready: "就绪",
      operationFailed: "操作失败。",
      adminTokenSaved: "管理令牌已保存到当前浏览器会话",
      adminTokenCleared: "管理令牌已清除",
      agentSynced: "智能体设置已同步",
      roleCreated: "已新增角色预设",
      roleDeleted: "角色预设已删除",
      defaultRoleChanged: "已切换默认角色",
      conversationRoleChanged: "已切换当前会话角色",
      conversationCreated: "已创建新会话",
      conversationDeleted: "会话已删除",
      modelSynced: "模型设置已同步",
      languageLocalOnly: "界面语言已本地切换；填写管理令牌后可持久保存。",
      streaming: "正在流式生成回复...",
      memoryUpdated: "记忆已更新",
      candidateRejected: "候选记忆已拒绝",
      memoryEmpty: "记忆内容不能为空。",
      memoryOrganized: "memory.md 已整理",
      searchKeywordRequired: "请输入搜索关键词。",
      normalMode: "已回到普通对话模式。",
      summaryGenerated: "已生成本地摘要。",
      summaryCandidateSaved: "摘要已加入候选记忆。",
      attachmentReady: "附件入口已响应；第一版先通过工具面板管理本地动作。",
      voiceReady: "语音入口已响应；已在输入框放入语音整理提示。",
      voicePrompt: "请把这段语音内容整理成文字：",
      noMemoryCandidates: "暂无候选记忆可提交。",
      streamFailed: "流式输出失败。",
      webSearchUnavailable: "联网搜索不可用。",
      modeLabels: {
        normal: "普通对话模式",
        thinking: "深度思考模式已启用，下一条消息会要求先分析再回答。",
        memory: "记忆整理模式已启用，下一条消息会优先识别候选记忆。",
        tools: "工具模式已启用，可从工具面板触发本地动作。",
        web: "联网搜索模式已启用，下一条消息会先搜索网络再回答。"
      } satisfies Record<ChatMode, string>
    },
    chat: {
      search: "搜索",
      settings: "设置",
      loadedMemoryTools: "已加载长期记忆 · 可调用工具",
      memoryToast: "已结合你的项目偏好、近期讨论和 memory.md 片段回答；候选记忆会在右侧等待确认。",
      thinking: "深度思考",
      organizeMemory: "整理记忆",
      webSearch: "联网搜索",
      summary: "生成摘要",
      tools: "调用工具",
      attach: "附件",
      voice: "语音",
      send: "发送",
      placeholder: "发消息，或让智能体记住一件事...",
      candidates: (count: number) => `候选记忆 ${count} 条`,
      candidatesHint: "候选记忆将在这里提示",
      memoriesLoaded: (count: number) => `${count} 条记忆已加载`,
      mobileNote: "主页保持纯聊天；角色、模型和记忆管理都在设置页。",
      mobileThinking: "思考",
      mobileMemory: "记忆",
      mobileSearch: "搜索",
      mobileTools: "工具",
      typing: "正在生成...",
      roleQuickPrompts: "当前角色快捷任务",
      referenced: (count: number) => `引用 ${count} 条记忆`
    },
    companion: {
      header: {
        online: "在线"
      },
      memory: {
        footnote: (count: number) => `引用了 ${count} 条记忆`
      },
      copySuccess: "已复制",
      greeting: {
        default: "你好，我是你的聊天伙伴。有什么想聊的吗？"
      },
      regenerate: "重新生成",
      copy: "复制"
    },
    persona: {
      avatar: "头像",
      color: "主题色",
      background: "聊天背景",
      uploadBackground: "上传图片",
      resetBackground: "恢复默认",
      defaultBackground: "默认蓝色液态背景",
      customBackground: "已使用自定义背景",
      backgroundHint: "支持 JPG、PNG、WebP，最大 8 MB",
      tone: "性格",
      greeting: "开场白"
    },
    sidebar: {
      memoryEnabled: "长期记忆已启用",
      conversations: "会话",
      newConversation: "新建会话",
      deleteConversation: "删除会话",
      messageCount: (count: number) => `${count} 条`,
      rolePresets: "角色预设",
      builtIn: "内置能力",
      newRole: "新增角色",
      deleteRole: "删除角色",
      createRolePrompt: "新角色名称？",
      createRoleDefault: "新角色",
      deleteRoleConfirm: "确定删除该角色预设吗？",
      deleteConversationConfirm: "确定删除该会话吗？",
      roleSettings: "角色设定",
      roleTitle: "角色标题",
      roleDescription: "角色描述",
      behaviorMode: "行为模式",
      proactiveFollowup: "主动追问",
      proactiveFollowupHint: "缺少信息时先确认",
      saveMemory: "记录记忆",
      saveMemoryHint: "沉淀稳定事实",
      strictRetrieval: "严格检索",
      strictRetrievalHint: "限制越界输出",
      temperature: "对话温度",
      stable: "稳定",
      balanced: "平衡",
      creative: "创造",
      modelConfig: "模型配置",
      model: "模型",
      api: "API",
      connected: "已连接",
      notConfigured: "未配置",
      provider: "供应商",
      context: "上下文",
      hint: "记忆写入前会先进候选区，确认后同步到 memory.md。"
    },
    mobileSettings: {
      workspace: "记忆工作台",
      settings: "设置",
      agentIdentity: "智能体身份",
      agentName: "智能体名称",
      role: "角色",
      behaviorSwitches: "行为开关",
      citeMemory: "引用记忆",
      citeMemoryHint: "回答中显示记忆来源",
      autoRecord: "自动记录",
      autoRecordHint: "捕获稳定偏好",
      strictRetrievalHint: "只使用选中记忆",
      keyConnected: "Key 已连接",
      keyMissing: "Key 未配置",
      contextSuffix: "上下文",
      memoryManagement: "记忆管理",
      expertTeams: "专家团",
      items: (count: number) => `${count} 项`,
      loaded: "已加载",
      candidates: "候选",
      conflicts: "冲突",
      review: "审核"
    },
    model: {
      providerTitle: "模型供应商",
      model: "模型",
      embeddingModel: "Embedding 模型（可选）",
      contextLength: "上下文长度",
      contextPresetLabel: "上下文长度快捷设置",
      apiKeyConfiguredPlaceholder: "已配置，点击输入新 Key 替换",
      apiKeyPlaceholder: "请输入 API Key",
      testing: "测试中",
      savingCanTest: "保存中，可测试",
      testConnection: "测试连接",
      testingConnection: "正在测试模型连接..."
    },
    admin: {
      title: "本地管理令牌",
      placeholderSaved: "已保存到当前会话，输入新令牌替换",
      placeholder: "输入 MEMORY_AGENT_ADMIN_TOKEN",
      save: "保存令牌",
      clear: "清除令牌",
      savedHint: "写入、聊天和联网搜索请求会自动携带令牌。",
      missingHint: "未填写时，受保护接口会返回 AUTH_REQUIRED。"
    },
    memory: {
      expand: "展开长期记忆面板",
      collapse: "收起长期记忆面板",
      longTerm: "长期记忆",
      context: "记忆上下文",
      loaded: "已加载",
      candidates: "候选",
      updated: "更新",
      openMemory: "打开 memory.md",
      loadedMemories: "已加载记忆",
      validCount: (count: number) => `${count} 条有效`,
      candidateMemories: "候选记忆",
      saving: "保存中",
      review: (count: number) => `审核 ${count}`,
      memory: "记忆",
      level: "等级",
      action: "操作",
      organize: "整理 memory.md",
      organizing: "整理中",
      committing: "提交中",
      commitCandidates: (count: number) => `提交候选 ${count}`,
      emptyCandidates: "暂无候选记忆。",
      emptyCandidatesHint: "暂无候选记忆。发送包含“记住/偏好/以后/不要”的消息后会生成候选。",
      currentMemory: "当前 memory.md",
      types: {
        user_preference: "用户偏好",
        project_fact: "项目事实",
        conversation_summary: "会话摘要"
      },
      shortTypes: {
        user_preference: "偏好",
        project_fact: "事实",
        conversation_summary: "摘要"
      },
      levels: {
        high: "高",
        medium: "中",
        low: "低"
      }
    },
    panels: {
      search: "搜索工作区",
      settings: "设置",
      memory: "memory.md",
      tools: "工具",
      summary: "会话摘要",
      agent: "智能体身份",
      webSearch: "联网搜索",
      team: "专家团配置",
      workspace: "记忆工作台"
    } satisfies Record<Exclude<ActivePanel, null>, string> & { workspace: string },
    searchPanel: {
      placeholder: "搜索对话、记忆、来源...",
      messages: "消息",
      memories: "记忆",
      noMessages: "没有匹配的消息。",
      noMemories: "没有匹配的记忆。"
    },
    webSearchPanel: {
      questionRequired: "请输入要联网搜索的问题。",
      promptReady: "已写入输入框；发送后会先联网搜索再回答。",
      placeholder: "搜索最新资料、产品信息、网页内容...",
      searching: "搜索中",
      webSearch: "联网搜索",
      useAsPrompt: "作为联网问题",
      resultsFor: (query: string) => `“${query}” 的结果`,
      results: "搜索结果",
      noSnippet: "没有可用摘要。",
      noResults: "没有拿到可用搜索结果，请换一个关键词。",
      empty: "输入关键词后会从网络搜索，并可把结果注入下一次聊天。"
    },
    toolsPanel: {
      testModel: "测试模型连接",
      testModelHint: "检查当前供应商 API Key 和模型名。",
      webSearchHint: "下一条消息会先搜索网络，再把结果注入模型上下文。",
      organizeMemory: "整理长期记忆",
      organizeMemoryHint: "重写 memory.md 和索引。",
      generateSummary: "生成会话摘要",
      generateSummaryHint: "基于最近消息生成摘要。",
      commitCandidates: "提交候选记忆",
      pendingCandidates: (count: number) => `${count} 条待提交`,
      noCandidates: "暂无候选，点击会给出提示。",
      attachment: "附件入口",
      attachmentHint: "显示当前 MVP 的能力边界。",
      voice: "语音入口",
      voiceHint: "显示当前 MVP 的能力边界。"
    },
    summaryPanel: {
      regenerate: "重新生成",
      addToCandidates: "加入候选记忆"
    }
  },
  en: {
    app: {
      loading: "Loading Memory Agent..."
    },
    common: {
      close: "Close",
      save: "Save",
      clear: "Clear",
      edit: "Edit",
      accept: "Accept",
      reject: "Reject",
      add: "Add",
      update: "Update",
      user: "User",
      assistant: "Agent",
      noSummary: "No summary generated yet."
    },
    status: {
      ready: "Ready",
      operationFailed: "Operation failed.",
      adminTokenSaved: "Admin token saved for this browser session",
      adminTokenCleared: "Admin token cleared",
      agentSynced: "Agent settings synced",
      roleCreated: "Role preset created",
      roleDeleted: "Role preset deleted",
      defaultRoleChanged: "Default role changed",
      conversationRoleChanged: "Conversation role changed",
      conversationCreated: "New conversation created",
      conversationDeleted: "Conversation deleted",
      modelSynced: "Model settings synced",
      languageLocalOnly: "Language changed locally. Add the admin token to persist it.",
      streaming: "Streaming response...",
      memoryUpdated: "Memory updated",
      candidateRejected: "Memory candidate rejected",
      memoryEmpty: "Memory content cannot be empty.",
      memoryOrganized: "memory.md organized",
      searchKeywordRequired: "Enter a search query.",
      normalMode: "Back to normal chat mode.",
      summaryGenerated: "Local summary generated.",
      summaryCandidateSaved: "Summary added as a memory candidate.",
      attachmentReady: "Attachment entry is active; local file actions live in Tools for this MVP.",
      voiceReady: "Voice entry is active; a transcription prompt was inserted.",
      voicePrompt: "Please transcribe and clean up this voice note: ",
      noMemoryCandidates: "No memory candidates to submit.",
      streamFailed: "Streaming failed.",
      webSearchUnavailable: "Web search is unavailable.",
      modeLabels: {
        normal: "Normal chat mode",
        thinking: "Deep thinking mode is on. The next reply will analyze before answering.",
        memory: "Memory organization mode is on. The next message will prioritize memory candidates.",
        tools: "Tools mode is on. Use the tools panel for local actions.",
        web: "Web search mode is on. The next message will search the web before answering."
      } satisfies Record<ChatMode, string>
    },
    chat: {
      search: "Search",
      settings: "Settings",
      loadedMemoryTools: "Long-term memory loaded · Tools available",
      memoryToast: "Using your project preferences, recent discussion, and memory.md snippets; candidates wait for review on the right.",
      thinking: "Deep Thinking",
      organizeMemory: "Organize Memory",
      webSearch: "Web Search",
      summary: "Summary",
      tools: "Tools",
      attach: "Attach",
      voice: "Voice",
      send: "Send",
      placeholder: "Message, or ask the agent to remember something...",
      candidates: (count: number) => `${count} memory candidate${count === 1 ? "" : "s"}`,
      candidatesHint: "Memory candidates will appear here",
      memoriesLoaded: (count: number) => `${count} memor${count === 1 ? "y" : "ies"} loaded`,
      mobileNote: "Chat stays focused here; roles, models, and memory live in Settings.",
      mobileThinking: "Think",
      mobileMemory: "Memory",
      mobileSearch: "Search",
      mobileTools: "Tools",
      typing: "Generating...",
      roleQuickPrompts: "Role quick tasks",
      referenced: (count: number) => `Referenced ${count} memor${count === 1 ? "y" : "ies"}`
    },
    companion: {
      header: {
        online: "Online"
      },
      memory: {
        footnote: (count: number) => `Referenced ${count} memor${count === 1 ? "y" : "ies"}`
      },
      copySuccess: "Copied",
      greeting: {
        default: "Hi, I'm your chat companion. What would you like to talk about?"
      },
      regenerate: "Regenerate",
      copy: "Copy"
    },
    persona: {
      avatar: "Avatar",
      color: "Theme Color",
      background: "Chat Background",
      uploadBackground: "Upload Image",
      resetBackground: "Use Default",
      defaultBackground: "Default blue liquid background",
      customBackground: "Custom background active",
      backgroundHint: "JPG, PNG or WebP, up to 8 MB",
      tone: "Personality",
      greeting: "Greeting"
    },
    sidebar: {
      memoryEnabled: "Long-term memory enabled",
      conversations: "Conversations",
      newConversation: "New conversation",
      deleteConversation: "Delete conversation",
      messageCount: (count: number) => `${count} msg${count === 1 ? "" : "s"}`,
      rolePresets: "Role Presets",
      builtIn: "Built-in",
      newRole: "New role",
      deleteRole: "Delete role",
      createRolePrompt: "New role name?",
      createRoleDefault: "New Role",
      deleteRoleConfirm: "Delete this role preset?",
      deleteConversationConfirm: "Delete this conversation?",
      roleSettings: "Role Settings",
      roleTitle: "Role title",
      roleDescription: "Role description",
      behaviorMode: "Behavior",
      proactiveFollowup: "Proactive follow-up",
      proactiveFollowupHint: "Ask first when key details are missing",
      saveMemory: "Record memory",
      saveMemoryHint: "Keep stable facts",
      strictRetrieval: "Strict retrieval",
      strictRetrievalHint: "Reduce unsupported output",
      temperature: "Temperature",
      stable: "Stable",
      balanced: "Balanced",
      creative: "Creative",
      modelConfig: "Model Config",
      model: "Model",
      api: "API",
      connected: "Connected",
      notConfigured: "Not configured",
      provider: "Provider",
      context: "Context",
      hint: "Memory enters the candidate queue first, then syncs to memory.md after approval."
    },
    mobileSettings: {
      workspace: "Memory Workbench",
      settings: "Settings",
      agentIdentity: "Agent Identity",
      agentName: "Agent name",
      role: "Role",
      behaviorSwitches: "Behavior Switches",
      citeMemory: "Cite memory",
      citeMemoryHint: "Show memory sources in replies",
      autoRecord: "Auto record",
      autoRecordHint: "Capture stable preferences",
      strictRetrievalHint: "Use only selected memory",
      keyConnected: "Key connected",
      keyMissing: "Key missing",
      contextSuffix: "context",
      memoryManagement: "Memory Management",
      expertTeams: "Expert Teams",
      items: (count: number) => `${count} item${count === 1 ? "" : "s"}`,
      loaded: "Loaded",
      candidates: "Candidates",
      conflicts: "Conflicts",
      review: "Review"
    },
    model: {
      providerTitle: "Model Provider",
      model: "Model",
      embeddingModel: "Embedding Model (Optional)",
      contextLength: "Context Length",
      contextPresetLabel: "Context length presets",
      apiKeyConfiguredPlaceholder: "Configured. Type a new key to replace it.",
      apiKeyPlaceholder: "Enter API Key",
      testing: "Testing",
      savingCanTest: "Saving, can test",
      testConnection: "Test Connection",
      testingConnection: "Testing model connection..."
    },
    admin: {
      title: "Local Admin Token",
      placeholderSaved: "Saved for this session. Type a new token to replace it.",
      placeholder: "Enter MEMORY_AGENT_ADMIN_TOKEN",
      save: "Save Token",
      clear: "Clear Token",
      savedHint: "Write, chat, and web search requests will include the token automatically.",
      missingHint: "Protected APIs return AUTH_REQUIRED when this is empty."
    },
    memory: {
      expand: "Expand long-term memory panel",
      collapse: "Collapse long-term memory panel",
      longTerm: "Long-term Memory",
      context: "Memory Context",
      loaded: "Loaded",
      candidates: "Candidates",
      updated: "Updated",
      openMemory: "Open memory.md",
      loadedMemories: "Loaded Memories",
      validCount: (count: number) => `${count} valid`,
      candidateMemories: "Memory Candidates",
      saving: "Saving",
      review: (count: number) => `Review ${count}`,
      memory: "Memory",
      level: "Level",
      action: "Action",
      organize: "Organize memory.md",
      organizing: "Organizing",
      committing: "Submitting",
      commitCandidates: (count: number) => `Submit ${count} candidate${count === 1 ? "" : "s"}`,
      emptyCandidates: "No memory candidates.",
      emptyCandidatesHint: "No memory candidates. Send a message with remember/prefer/later/don't to generate candidates.",
      currentMemory: "Current memory.md",
      types: {
        user_preference: "User Preference",
        project_fact: "Project Fact",
        conversation_summary: "Conversation Summary"
      },
      shortTypes: {
        user_preference: "Preference",
        project_fact: "Fact",
        conversation_summary: "Summary"
      },
      levels: {
        high: "High",
        medium: "Medium",
        low: "Low"
      }
    },
    panels: {
      search: "Search Workspace",
      settings: "Settings",
      memory: "memory.md",
      tools: "Tools",
      summary: "Conversation Summary",
      agent: "Agent Identity",
      webSearch: "Web Search",
      team: "Expert Team",
      workspace: "Memory Workbench"
    } satisfies Record<Exclude<ActivePanel, null>, string> & { workspace: string },
    searchPanel: {
      placeholder: "Search conversations, memory, sources...",
      messages: "Messages",
      memories: "Memory",
      noMessages: "No matching messages.",
      noMemories: "No matching memory."
    },
    webSearchPanel: {
      questionRequired: "Enter a web search question.",
      promptReady: "Added to the input. Sending will search the web before answering.",
      placeholder: "Search recent sources, products, or web pages...",
      searching: "Searching",
      webSearch: "Web Search",
      useAsPrompt: "Use as web prompt",
      resultsFor: (query: string) => `Results for "${query}"`,
      results: "Search Results",
      noSnippet: "No summary available.",
      noResults: "No usable search results. Try another query.",
      empty: "Enter a query to search the web and inject results into the next chat."
    },
    toolsPanel: {
      testModel: "Test Model Connection",
      testModelHint: "Check the current provider API key and model name.",
      webSearchHint: "The next message searches the web, then injects results into model context.",
      organizeMemory: "Organize Long-term Memory",
      organizeMemoryHint: "Rewrite memory.md and its index.",
      generateSummary: "Generate Summary",
      generateSummaryHint: "Summarize recent messages.",
      commitCandidates: "Submit Memory Candidates",
      pendingCandidates: (count: number) => `${count} pending`,
      noCandidates: "No candidates. Click to show a hint.",
      attachment: "Attachment Entry",
      attachmentHint: "Shows the current MVP boundary.",
      voice: "Voice Entry",
      voiceHint: "Shows the current MVP boundary."
    },
    summaryPanel: {
      regenerate: "Regenerate",
      addToCandidates: "Add to Candidates"
    }
  }
} as const;

export function getUiText(language?: UiLanguage) {
  return language === "en" ? copy.en : copy.zh;
}

export function memoryTypeLabel(type: string, language?: UiLanguage, short = false) {
  const labels = short ? getUiText(language).memory.shortTypes : getUiText(language).memory.types;
  return labels[type as keyof typeof labels] || type;
}

export function memoryLevelLabel(level: "high" | "medium" | "low", language?: UiLanguage) {
  return getUiText(language).memory.levels[level];
}

export function formatEditedAgoText(minutes: number, language?: UiLanguage) {
  if (language === "en") {
    if (minutes <= 0) return "Updated just now";
    if (minutes === 1) return "Updated 1 minute ago";
    return `Updated ${minutes} minutes ago`;
  }
  if (minutes <= 0) return "刚刚更新";
  if (minutes === 1) return "1 分钟前更新";
  return `${minutes} 分钟前更新`;
}
