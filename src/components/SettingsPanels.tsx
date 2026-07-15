import { Bot, CheckCircle2, ClipboardList, Database, FileText, Loader2, MessageSquarePlus, Plus, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { useState, type FocusEvent, type MouseEvent } from "react";
import { getUiText } from "../i18n";
import type { ModelProviderConfig, ProviderId } from "../types";
import type { WorkbenchProps } from "../workbenchTypes";
import { InfoLine, MobileSettingRow, Stat, ToggleRow } from "./ui";

const contextLengthOptions = [32000, 64000, 128000];

function RoleSwitcher({ roleStore, agentConfig, saving, busyAction, createRole, deleteRole, setConversationRole }: WorkbenchProps) {
  const busy = saving && busyAction === "role-save";
  const text = getUiText(agentConfig.language);

  function handleSelect(roleId: string) {
    if (roleId === agentConfig.id) return;
    setConversationRole(roleId);
  }

  function handleCreate() {
    const name = window.prompt(text.sidebar.createRolePrompt, text.sidebar.createRoleDefault);
    if (!name || !name.trim()) return;
    createRole({ name: name.trim(), roleTitle: name.trim() });
  }

  function handleDelete(roleId: string) {
    if (roleStore.roles.length <= 1) return;
    if (!window.confirm(text.sidebar.deleteRoleConfirm)) return;
    deleteRole(roleId);
  }

  return (
    <section className="panel-section role-switcher">
      <div className="section-head">
        <h2>{text.sidebar.rolePresets}</h2>
        <button type="button" className="icon-button" onClick={handleCreate} disabled={busy} aria-label={text.sidebar.newRole}>
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
              <button type="button" className="icon-button danger" onClick={() => handleDelete(role.id)} disabled={busy} aria-label={text.sidebar.deleteRole}>
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConversationSwitcher({ agentConfig, conversation, conversations, saving, busyAction, createConversation, switchConversation, deleteConversation }: WorkbenchProps) {
  const busy = saving && busyAction === "conversation-switch";
  const text = getUiText(agentConfig.language);

  function handleCreate() {
    createConversation({});
  }

  function handleDelete(event: MouseEvent, conversationId: string) {
    event.stopPropagation();
    if (conversations.length <= 1) return;
    if (!window.confirm(text.sidebar.deleteConversationConfirm)) return;
    deleteConversation(conversationId);
  }

  return (
    <section className="panel-section conversation-switcher">
      <div className="section-head">
        <h2>{text.sidebar.conversations}</h2>
        <button type="button" className="icon-button" onClick={handleCreate} disabled={busy} aria-label={text.sidebar.newConversation}>
          <MessageSquarePlus size={15} />
        </button>
      </div>
      <ul className="conversation-list">
        {conversations.map((item) => (
          <li key={item.id} className={item.id === conversation.id ? "active" : ""}>
            <button type="button" onClick={() => switchConversation(item.id)} disabled={busy}>
              <span className="conversation-title">{item.title}</span>
              <span className="conversation-meta">{text.sidebar.messageCount(item.messageCount)}</span>
            </button>
            {conversations.length > 1 && (
              <button type="button" className="icon-button danger" onClick={(event) => handleDelete(event, item.id)} disabled={busy} aria-label={text.sidebar.deleteConversation}>
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
  const text = getUiText(agentConfig.language);
  return (
    <aside className="agent-sidebar">
      <div className="brand-row">
        <div className="brand-mark">
          <Sparkles size={24} />
        </div>
        <div>
          <h1>{agentConfig.name}</h1>
          <p><span className="live-dot" />{text.sidebar.memoryEnabled}</p>
        </div>
      </div>

      <ConversationSwitcher {...props} />

      <RoleSwitcher {...props} />

      <section className="panel-section">
        <h2>{text.sidebar.roleSettings}</h2>
        <div className="role-card">
          <input
            aria-label={text.sidebar.roleTitle}
            value={agentConfig.roleTitle}
            onChange={(event) => updateAgent({ ...agentConfig, roleTitle: event.target.value })}
          />
          <textarea
            aria-label={text.sidebar.roleDescription}
            value={agentConfig.roleDescription}
            onChange={(event) => updateAgent({ ...agentConfig, roleDescription: event.target.value })}
          />
        </div>
      </section>

      <section className="panel-section">
        <h2>{text.sidebar.behaviorMode}</h2>
        <ToggleRow
          title={text.sidebar.proactiveFollowup}
          subtitle={text.sidebar.proactiveFollowupHint}
          checked={agentConfig.behavior.proactiveFollowup}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, proactiveFollowup: checked } })}
        />
        <ToggleRow
          title={text.sidebar.saveMemory}
          subtitle={text.sidebar.saveMemoryHint}
          checked={agentConfig.behavior.autoSaveNotes}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, autoSaveNotes: checked } })}
        />
        <ToggleRow
          title={text.sidebar.strictRetrieval}
          subtitle={text.sidebar.strictRetrievalHint}
          checked={agentConfig.behavior.strictRetrieval}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, strictRetrieval: checked } })}
        />
      </section>

      <section className="panel-section">
        <div className="section-head">
          <h2>{text.sidebar.temperature}</h2>
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
          <span>{text.sidebar.stable}</span>
          <span>{text.sidebar.balanced}</span>
          <span>{text.sidebar.creative}</span>
        </div>
      </section>

      <section className="panel-section model-summary">
        <h2>{text.sidebar.modelConfig}</h2>
        <InfoLine label={text.sidebar.model} value={selectedProvider.model} />
        <InfoLine label={text.sidebar.api} value={selectedProvider.apiKeySet ? text.sidebar.connected : text.sidebar.notConfigured} tone={selectedProvider.apiKeySet ? "green" : "amber"} />
        <InfoLine label={text.sidebar.provider} value={modelConfig.providers[modelConfig.selectedProvider].label} />
        <InfoLine label={text.sidebar.context} value={`${Math.round(selectedProvider.contextLength / 1000)}k`} />
      </section>

      <div className="hint-block">
        <Database size={18} />
        <span>{text.sidebar.hint}</span>
      </div>
    </aside>
  );
}

export function MobileSettings(props: WorkbenchProps) {
  const { agentConfig, selectedProvider, setMobileView, pendingCandidates, memoryState, commitCandidates, updateAgent, openPanel } = props;
  const text = getUiText(agentConfig.language);
  return (
    <section className="phone-frame settings motion-page">
      <div className="phone-status"><strong>9:41</strong><span>⌁ ◔ ▱</span></div>
      <header className="settings-header">
        <div>
          <span>{text.mobileSettings.workspace}</span>
          <h1>{text.mobileSettings.settings}</h1>
        </div>
        <button type="button" aria-label={text.common.close} onClick={() => setMobileView("chat")}><X size={20} /></button>
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
          <h2>{text.mobileSettings.agentIdentity}</h2>
          <MobileSettingRow icon={<Bot size={16} />} label={text.mobileSettings.agentName} value={agentConfig.name} onClick={() => openPanel("agent")} />
          <MobileSettingRow icon={<CheckCircle2 size={16} />} label={text.mobileSettings.role} value={agentConfig.roleTitle} onClick={() => openPanel("agent")} />
        </div>
        <div className="mobile-card">
          <h2><SlidersHorizontal size={16} />{text.mobileSettings.behaviorSwitches}</h2>
          <ToggleRow
            title={text.mobileSettings.citeMemory}
            subtitle={text.mobileSettings.citeMemoryHint}
            checked={agentConfig.behavior.citeMemory}
            onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, citeMemory: checked } })}
          />
          <ToggleRow
            title={text.mobileSettings.autoRecord}
            subtitle={text.mobileSettings.autoRecordHint}
            checked={agentConfig.behavior.autoSaveNotes}
            onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, autoSaveNotes: checked } })}
          />
          <ToggleRow
            title={text.sidebar.strictRetrieval}
            subtitle={text.mobileSettings.strictRetrievalHint}
            checked={agentConfig.behavior.strictRetrieval}
            onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, strictRetrieval: checked } })}
          />
        </div>
        <div className="mobile-card">
          <div className="section-head"><h2>{text.sidebar.temperature}</h2><span>{agentConfig.temperature.toFixed(1)}</span></div>
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
            <span>{selectedProvider.apiKeySet ? text.mobileSettings.keyConnected : text.mobileSettings.keyMissing} · {Math.round(selectedProvider.contextLength / 1000)}k {text.mobileSettings.contextSuffix}</span>
          </div>
        </div>
        <div className="mobile-card">
          <div className="section-head"><h2>{text.mobileSettings.memoryManagement}</h2><span>{text.mobileSettings.items(memoryState.items.length)}</span></div>
          <div className="memory-metrics">
            <Stat value={String(memoryState.stats.loaded)} label={text.mobileSettings.loaded} />
            <Stat value={String(pendingCandidates.length || memoryState.stats.candidates)} label={text.mobileSettings.candidates} />
            <Stat value="0" label={text.mobileSettings.conflicts} />
          </div>
          <div className="mobile-buttons">
            <button type="button" onClick={() => commitCandidates()}><ClipboardList size={16} />{text.mobileSettings.review}</button>
            <button type="button" className="blue" onClick={() => openPanel("memory")}><FileText size={16} />memory.md</button>
          </div>
        </div>
        <ModelSettings {...props} compact />
      </div>
    </section>
  );
}

export function ModelSettings({ agentConfig, modelConfig, saveModel, testModel, compact, saving, busyAction, status, error }: WorkbenchProps & { compact?: boolean }) {
  const provider = modelConfig.providers[modelConfig.selectedProvider];
  const testing = busyAction === "model-test";
  const providerIds = Object.keys(modelConfig.providers) as ProviderId[];
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [editingApiKey, setEditingApiKey] = useState(false);
  const showingSavedApiKey = Boolean(provider.apiKeyPreview && !apiKeyDraft && !editingApiKey);
  const text = getUiText(agentConfig.language);

  function patchProvider(patch: Partial<ModelProviderConfig>) {
    return saveModel({
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

  async function saveApiKeyDraft() {
    const apiKey = apiKeyDraft.trim();
    if (!apiKey) {
      setEditingApiKey(false);
      return true;
    }
    const ok = await patchProvider({ apiKey });
    if (ok) {
      setApiKeyDraft("");
      setEditingApiKey(false);
    }
    return ok;
  }

  async function handleApiKeyBlur(event: FocusEvent<HTMLInputElement>) {
    if (isModelTestTarget(event.relatedTarget)) return;
    await saveApiKeyDraft();
  }

  async function handleTestClick() {
    const ok = await saveApiKeyDraft();
    if (!ok) return;
    await testModel();
  }

  return (
    <div className={compact ? "mobile-card model-editor compact" : "model-editor"}>
      <h2>{text.model.providerTitle}</h2>
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
        {text.model.model}
        <input value={provider.model} onChange={(event) => patchProvider({ model: event.target.value })} />
      </label>
      <label>
        {text.model.embeddingModel}
        <input
          value={provider.embeddingModel || ""}
          placeholder={modelConfig.selectedProvider === "anthropic" ? "Not supported" : "text-embedding-3-small"}
          disabled={modelConfig.selectedProvider === "anthropic"}
          onChange={(event) => patchProvider({ embeddingModel: event.target.value })}
        />
      </label>
      <label>
        {text.model.contextLength}
        <input
          type="number"
          min="1000"
          step="1000"
          value={provider.contextLength}
          onChange={(event) => patchProvider({ contextLength: Math.max(1000, Number(event.target.value) || 64000) })}
        />
      </label>
      <div className="context-presets" aria-label={text.model.contextPresetLabel}>
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
          type={showingSavedApiKey ? "text" : "password"}
          value={showingSavedApiKey ? provider.apiKeyPreview : apiKeyDraft}
          placeholder={provider.apiKeySet ? text.model.apiKeyConfiguredPlaceholder : text.model.apiKeyPlaceholder}
          readOnly={showingSavedApiKey}
          className={showingSavedApiKey ? "api-key-masked" : ""}
          onFocus={() => setEditingApiKey(true)}
          onChange={(event) => setApiKeyDraft(event.target.value)}
          onBlur={handleApiKeyBlur}
        />
      </label>
      <button type="button" data-model-test="true" className={`test-button ${testing ? "is-loading" : ""}`} onClick={handleTestClick} disabled={testing}>
        {testing && <Loader2 className="spin" size={15} />}
        {testing ? text.model.testing : saving ? text.model.savingCanTest : text.model.testConnection}
      </button>
      <p className={`model-feedback ${error ? "error" : ""}`}>
        {error || (testing ? text.model.testingConnection : status)}
      </p>
    </div>
  );
}

function isModelTestTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.dataset.modelTest === "true";
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
  const text = getUiText(agentConfig.language);
  return (
    <div className={embedded ? "embedded-editor" : "drawer-body"}>
      <section className="drawer-section">
        <h3>{text.mobileSettings.agentIdentity}</h3>
        <label className="field">
          {text.mobileSettings.agentName}
          <input value={agentConfig.name} onChange={(event) => updateAgent({ ...agentConfig, name: event.target.value })} />
        </label>
        <label className="field">
          {text.sidebar.roleTitle}
          <input value={agentConfig.roleTitle} onChange={(event) => updateAgent({ ...agentConfig, roleTitle: event.target.value })} />
        </label>
        <label className="field">
          {text.sidebar.roleDescription}
          <textarea value={agentConfig.roleDescription} onChange={(event) => updateAgent({ ...agentConfig, roleDescription: event.target.value })} />
        </label>
      </section>
      <section className="drawer-section">
        <h3>{text.sidebar.behaviorMode}</h3>
        <ToggleRow
          title={text.sidebar.proactiveFollowup}
          subtitle={text.sidebar.proactiveFollowupHint}
          checked={agentConfig.behavior.proactiveFollowup}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, proactiveFollowup: checked } })}
        />
        <ToggleRow
          title={text.mobileSettings.citeMemory}
          subtitle={text.mobileSettings.citeMemoryHint}
          checked={agentConfig.behavior.citeMemory}
          onChange={(checked) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, citeMemory: checked } })}
        />
      </section>
    </div>
  );
}

function AdminTokenPanel({ agentConfig, adminToken, updateAdminToken, compact }: WorkbenchProps & { compact?: boolean }) {
  const [draft, setDraft] = useState("");
  const text = getUiText(agentConfig.language);

  function saveToken() {
    if (!draft.trim()) return;
    updateAdminToken(draft);
    setDraft("");
  }

  return (
    <div className={compact ? "mobile-card model-editor compact" : "model-editor"}>
      <h2>{text.admin.title}</h2>
      <label>
        X-Admin-Token
        <input
          type="password"
          value={draft}
          placeholder={adminToken ? text.admin.placeholderSaved : text.admin.placeholder}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div className="drawer-actions">
        <button type="button" onClick={saveToken} disabled={!draft.trim()}>{text.admin.save}</button>
        <button type="button" onClick={() => updateAdminToken("")} disabled={!adminToken}>{text.admin.clear}</button>
      </div>
      <p className="empty-copy">{adminToken ? text.admin.savedHint : text.admin.missingHint}</p>
    </div>
  );
}
