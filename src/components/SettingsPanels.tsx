import { Bot, CheckCircle2, ClipboardList, Database, FileText, Loader2, MessageSquarePlus, Plus, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { useState, type MouseEvent } from "react";
import type { ModelProviderConfig, ProviderId } from "../types";
import type { WorkbenchProps } from "../workbenchTypes";
import { InfoLine, MobileSettingRow, Segmented, Stat, ToggleRow } from "./ui";

const contextLengthOptions = [32000, 64000, 128000];

function RoleSwitcher({ roleStore, agentConfig, saving, busyAction, createRole, deleteRole, setConversationRole }: WorkbenchProps) {
  const busy = saving && busyAction === "role-save";

  function handleSelect(roleId: string) {
    if (roleId === agentConfig.id) return;
    setConversationRole(roleId);
  }

  function handleCreate() {
    const name = window.prompt("新角色名称？", "新角色");
    if (!name || !name.trim()) return;
    createRole({ name: name.trim(), roleTitle: name.trim() });
  }

  function handleDelete(roleId: string) {
    if (roleStore.roles.length <= 1) return;
    if (!window.confirm("确定删除该角色预设吗？")) return;
    deleteRole(roleId);
  }

  return (
    <section className="panel-section role-switcher">
      <div className="section-head">
        <h2>角色预设</h2>
        <button type="button" className="icon-button" onClick={handleCreate} disabled={busy} aria-label="新增角色">
          <Plus size={15} />
        </button>
      </div>
      <ul className="role-list">
        {roleStore.roles.map((role) => (
          <li key={role.id} className={role.id === agentConfig.id ? "active" : ""}>
            <button type="button" onClick={() => handleSelect(role.id)} disabled={busy}>
              {role.name || role.roleTitle}
            </button>
            {roleStore.roles.length > 1 && (
              <button type="button" className="icon-button danger" onClick={() => handleDelete(role.id)} disabled={busy} aria-label="删除角色">
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConversationSwitcher({ conversation, conversations, saving, busyAction, createConversation, switchConversation, deleteConversation }: WorkbenchProps) {
  const busy = saving && busyAction === "conversation-switch";

  function handleCreate() {
    createConversation({});
  }

  function handleDelete(event: MouseEvent, conversationId: string) {
    event.stopPropagation();
    if (conversations.length <= 1) return;
    if (!window.confirm("确定删除该会话吗？")) return;
    deleteConversation(conversationId);
  }

  return (
    <section className="panel-section conversation-switcher">
      <div className="section-head">
        <h2>会话</h2>
        <button type="button" className="icon-button" onClick={handleCreate} disabled={busy} aria-label="新建会话">
          <MessageSquarePlus size={15} />
        </button>
      </div>
      <ul className="conversation-list">
        {conversations.map((item) => (
          <li key={item.id} className={item.id === conversation.id ? "active" : ""}>
            <button type="button" onClick={() => switchConversation(item.id)} disabled={busy}>
              <span className="conversation-title">{item.title}</span>
              <span className="conversation-meta">{item.messageCount} 条</span>
            </button>
            {conversations.length > 1 && (
              <button type="button" className="icon-button danger" onClick={(event) => handleDelete(event, item.id)} disabled={busy} aria-label="删除会话">
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AgentSidebar(props: WorkbenchProps) {
  const { agentConfig, modelConfig, selectedProvider, updateAgent } = props;
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

      <ConversationSwitcher {...props} />

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

      <RoleSwitcher {...props} />

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
          title="严格检索"
          subtitle="限制越界输出"
          checked={agentConfig.behavior.strictRetrieval}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, strictRetrieval: checked } })}
        />
      </section>

      <section className="panel-section">
        <div className="section-head">
          <h2>对话温度</h2>
          <span>{agentConfig.temperature.toFixed(1)}</span>
        </div>
        <input
          className="range"
          type="range"
          min="0"
          max="1"
          step="0.1"
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

export function MobileSettings(props: WorkbenchProps) {
  const { agentConfig, selectedProvider, setMobileView, pendingCandidates, memoryState, commitCandidates, updateAgent, openPanel } = props;
  return (
    <section className="phone-frame settings motion-page">
      <div className="phone-status"><strong>9:41</strong><span>⌁ ◔ ▱</span></div>
      <header className="settings-header">
        <div>
          <span>记忆工作台</span>
          <h1>设置</h1>
        </div>
        <button type="button" onClick={() => setMobileView("chat")}><X size={20} /></button>
      </header>
      <div className="settings-stack">
        <AdminTokenPanel {...props} compact />
        <div className="mobile-card">
          <ConversationSwitcher {...props} />
        </div>
        <div className="mobile-card">
          <RoleSwitcher {...props} />
        </div>
        <div className="mobile-card">
          <h2>智能体身份</h2>
          <MobileSettingRow icon={<Bot size={16} />} label="智能体名称" value={agentConfig.name} onClick={() => openPanel("agent")} />
          <MobileSettingRow icon={<CheckCircle2 size={16} />} label="角色" value={agentConfig.roleTitle} onClick={() => openPanel("agent")} />
        </div>
        <div className="mobile-card">
          <h2><SlidersHorizontal size={16} />行为开关</h2>
          <ToggleRow
            title="中文界面"
            subtitle="关闭后使用英文语言标记"
            checked={agentConfig.language === "zh"}
            onChange={(checked) => updateAgent({ ...agentConfig, language: checked ? "zh" : "en" })}
          />
          <ToggleRow
            title="引用记忆"
            subtitle="回答中显示记忆来源"
            checked={agentConfig.behavior.citeMemory}
            onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, citeMemory: checked } })}
          />
          <ToggleRow
            title="自动记录"
            subtitle="捕获稳定偏好"
            checked={agentConfig.behavior.autoSaveNotes}
            onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, autoSaveNotes: checked } })}
          />
          <ToggleRow
            title="严格检索"
            subtitle="只使用选中记忆"
            checked={agentConfig.behavior.strictRetrieval}
            onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, strictRetrieval: checked } })}
          />
        </div>
        <div className="mobile-card">
          <div className="section-head"><h2>对话温度</h2><span>{agentConfig.temperature.toFixed(1)}</span></div>
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
            <span>{selectedProvider.apiKeySet ? "Key 已连接" : "Key 未配置"} · {Math.round(selectedProvider.contextLength / 1000)}k 上下文</span>
          </div>
        </div>
        <div className="mobile-card">
          <div className="section-head"><h2>记忆管理</h2><span>{memoryState.items.length} 项</span></div>
          <div className="memory-metrics">
            <Stat value={String(memoryState.stats.loaded)} label="已加载" />
            <Stat value={String(pendingCandidates.length || memoryState.stats.candidates)} label="候选" />
            <Stat value="0" label="冲突" />
          </div>
          <div className="mobile-buttons">
            <button type="button" onClick={() => commitCandidates()}><ClipboardList size={16} />审核</button>
            <button type="button" className="blue" onClick={() => openPanel("memory")}><FileText size={16} />memory.md</button>
          </div>
        </div>
        <ModelSettings {...props} compact />
      </div>
    </section>
  );
}

export function ModelSettings({ modelConfig, saveModel, testModel, compact, saving, busyAction }: WorkbenchProps & { compact?: boolean }) {
  const provider = modelConfig.providers[modelConfig.selectedProvider];
  const testing = busyAction === "model-test";
  const providerIds = Object.keys(modelConfig.providers) as ProviderId[];

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
      <h2>模型供应商</h2>
      <select
        value={modelConfig.selectedProvider}
        onChange={(event) => saveModel({ ...modelConfig, selectedProvider: event.target.value as ProviderId })}
      >
        {providerIds.map((id) => (
          <option key={id} value={id}>{modelConfig.providers[id].label}</option>
        ))}
      </select>
      <label>
        Base URL
        <input value={provider.baseURL} onChange={(event) => patchProvider({ baseURL: event.target.value })} />
      </label>
      <label>
        模型
        <input value={provider.model} onChange={(event) => patchProvider({ model: event.target.value })} />
      </label>
      <label>
        上下文长度
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
          placeholder={provider.apiKeySet ? "已配置，输入新 Key 替换" : "请输入 API Key"}
          onBlur={(event) => {
            if (event.target.value.trim()) patchProvider({ apiKey: event.target.value.trim() });
            event.target.value = "";
          }}
        />
      </label>
      <button type="button" className={`test-button ${testing ? "is-loading" : ""}`} onClick={testModel} disabled={testing || saving}>
        {testing && <Loader2 className="spin" size={15} />}
        {testing ? "测试中" : "测试连接"}
      </button>
    </div>
  );
}

export function SettingsPanel(props: WorkbenchProps) {
  return (
    <div className="drawer-body split-body">
      <AgentEditorPanel {...props} embedded />
      <div className="embedded-editor">
        <AdminTokenPanel {...props} />
        <ModelSettings {...props} compact />
      </div>
    </div>
  );
}

export function AgentEditorPanel({ agentConfig, updateAgent, embedded }: WorkbenchProps & { embedded?: boolean }) {
  return (
    <div className={embedded ? "embedded-editor" : "drawer-body"}>
      <section className="drawer-section">
        <h3>智能体身份</h3>
        <label className="field">
          智能体名称
          <input value={agentConfig.name} onChange={(event) => updateAgent({ ...agentConfig, name: event.target.value })} />
        </label>
        <label className="field">
          角色标题
          <input value={agentConfig.roleTitle} onChange={(event) => updateAgent({ ...agentConfig, roleTitle: event.target.value })} />
        </label>
        <label className="field">
          行为提示词
          <textarea value={agentConfig.roleDescription} onChange={(event) => updateAgent({ ...agentConfig, roleDescription: event.target.value })} />
        </label>
      </section>
      <section className="drawer-section">
        <h3>行为设置</h3>
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

function AdminTokenPanel({ adminToken, updateAdminToken, compact }: WorkbenchProps & { compact?: boolean }) {
  const [draft, setDraft] = useState("");

  function saveToken() {
    if (!draft.trim()) return;
    updateAdminToken(draft);
    setDraft("");
  }

  return (
    <div className={compact ? "mobile-card model-editor compact" : "model-editor"}>
      <h2>本地管理令牌</h2>
      <label>
        X-Admin-Token
        <input
          type="password"
          value={draft}
          placeholder={adminToken ? "已保存到当前会话，输入新令牌替换" : "输入 MEMORY_AGENT_ADMIN_TOKEN"}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div className="drawer-actions">
        <button type="button" onClick={saveToken} disabled={!draft.trim()}>保存令牌</button>
        <button type="button" onClick={() => updateAdminToken("")} disabled={!adminToken}>清除令牌</button>
      </div>
      <p className="empty-copy">{adminToken ? "写入、聊天和联网搜索请求会自动携带令牌。" : "未填写时，受保护接口会返回 AUTH_REQUIRED。"}</p>
    </div>
  );
}
