import type { WorkbenchProps } from "../workbenchTypes";
import { AdminTokenPanel, BackgroundSettings, MobileSettings, ConversationSwitcher, RoleSwitcher } from "./SettingsPanels";
import { ChatPanel, MobileChat } from "./ChatPanel";
import { MemoryDetailPanel } from "./MemoryPanel";
import { Search, Database, SlidersHorizontal, Users, X } from "lucide-react";
import { getUiText } from "../i18n";
import "../companion.css";

const ACCENT_PRESETS = [
  "#6366f1", "#8b5cf6", "#d946ef", "#ec4899",
  "#f43f5e", "#ef4444", "#f97316", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
  "#0ea5e9", "#3b82f6", "#6b7280", "#a8a29e",
];

const EMOJI_OPTIONS = ["🤖", "🧑‍💻", "👨‍🔬", "👩‍🎨", "🧙‍♂️", "🧝‍♀️", "🦊", "🐱", "🐶", "🐰", "🦋", "🌻", "⭐", "🎵", "📚", "🎮"];

function DrawerSettingsPanel(props: WorkbenchProps) {
  const { agentConfig, modelConfig, selectedProvider, teamStore, updateAgent, openPanel } = props;
  const text = getUiText(agentConfig.language);

  return (
    <div className="drawer-body">
      <AdminTokenPanel {...props} compact />

      {/* 会话列表 */}
      <ConversationSwitcher {...props} />

      {/* 角色预设 */}
      <RoleSwitcher {...props} />

      <section className="drawer-section">
        <div className="section-head">
          <h3>{text.mobileSettings.expertTeams}</h3>
          <button className="icon-button" type="button" onClick={() => openPanel("team")} aria-label={text.mobileSettings.expertTeams}>
            <Users size={17} />
          </button>
        </div>
        <button type="button" className="team-settings-entry" onClick={() => openPanel("team")}>
          <span><Users size={18} /></span>
          <strong>{teamStore.teams.length ? `${teamStore.teams.length} 个专家团` : "创建专家团"}</strong>
          <small>{teamStore.teams.reduce((count, team) => count + team.memberRoleIds.length, 0)} 个成员配置</small>
        </button>
      </section>

      {/* 人设编辑（精简） */}
      <section className="drawer-section">
        <h3>{text.mobileSettings.agentIdentity}</h3>
        <div className="persona-editor">
          <div className="field">
            <label>{text.mobileSettings.agentName}</label>
            <input
              value={agentConfig.name}
              onChange={(e) => updateAgent({ ...agentConfig, name: e.target.value })}
            />
          </div>

          {/* Emoji 头像选择 */}
          <div className="field">
            <label>{text.persona.avatar}</label>
            <div className="emoji-picker">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={agentConfig.avatar === emoji || (!agentConfig.avatar && emoji === "🤖") ? "active" : ""}
                  onClick={() => updateAgent({ ...agentConfig, avatar: emoji })}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* 主题色选择 */}
          <div className="field">
            <label>{text.persona.color}</label>
            <div className="color-swatches">
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-swatch ${agentConfig.accentColor === color || (!agentConfig.accentColor && color === "#6366f1") ? "active" : ""}`}
                  style={{ background: color }}
                  onClick={() => updateAgent({ ...agentConfig, accentColor: color })}
                  aria-label={color}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <label>{text.persona.background}</label>
            <BackgroundSettings {...props} />
          </div>

          {/* 性格语调 */}
          <div className="field">
            <label>{text.persona.tone}</label>
            <input
              value={agentConfig.personalityTone || ""}
              onChange={(e) => updateAgent({ ...agentConfig, personalityTone: e.target.value })}
              placeholder={agentConfig.language === "en" ? "e.g. warm, professional, witty..." : "例如：温暖、专业、幽默..."}
            />
          </div>

          {/* 开场白 */}
          <div className="field">
            <label>{text.persona.greeting}</label>
            <textarea
              value={agentConfig.greeting || ""}
              onChange={(e) => updateAgent({ ...agentConfig, greeting: e.target.value })}
              placeholder={agentConfig.language === "en" ? "Hi, I'm your chat companion..." : "你好，我是你的聊天伙伴..."}
              rows={3}
            />
          </div>
        </div>
      </section>

      {/* 行为模式 */}
      <section className="drawer-section">
        <h3>{text.sidebar.behaviorMode}</h3>
        <div className="behavior-section">
          {/* We render ToggleRow inline since we need to import it */}
          <label className="toggle-row">
            <span>
              <strong>{text.sidebar.proactiveFollowup}</strong>
              <em>{text.sidebar.proactiveFollowupHint}</em>
            </span>
            <input
              type="checkbox"
              checked={agentConfig.behavior.proactiveFollowup}
              onChange={(e) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, proactiveFollowup: e.target.checked } })}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>{text.mobileSettings.citeMemory}</strong>
              <em>{text.mobileSettings.citeMemoryHint}</em>
            </span>
            <input
              type="checkbox"
              checked={agentConfig.behavior.citeMemory}
              onChange={(e) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, citeMemory: e.target.checked } })}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>{text.sidebar.saveMemory}</strong>
              <em>{text.sidebar.saveMemoryHint}</em>
            </span>
            <input
              type="checkbox"
              checked={agentConfig.behavior.autoSaveNotes}
              onChange={(e) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, autoSaveNotes: e.target.checked } })}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>{text.sidebar.strictRetrieval}</strong>
              <em>{text.sidebar.strictRetrievalHint}</em>
            </span>
            <input
              type="checkbox"
              checked={agentConfig.behavior.strictRetrieval}
              onChange={(e) => updateAgent({ ...agentConfig, behavior: { ...agentConfig.behavior, strictRetrieval: e.target.checked } })}
            />
          </label>
        </div>
      </section>

      {/* 温度 */}
      <section className="drawer-section temperature-section">
        <div className="section-head">
          <h3>{text.sidebar.temperature}</h3>
          <span>{agentConfig.temperature.toFixed(1)}</span>
        </div>
        <input
          className="range"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={agentConfig.temperature}
          onChange={(e) => updateAgent({ ...agentConfig, temperature: Number(e.target.value) })}
        />
        <div className="range-labels">
          <span>{text.sidebar.stable}</span>
          <span>{text.sidebar.balanced}</span>
          <span>{text.sidebar.creative}</span>
        </div>
      </section>

      {/* 模型配置摘要 */}
      <section className="drawer-section">
        <h3>{text.sidebar.modelConfig}</h3>
        <div className="model-config-summary">
          <div className="info-line">
            <span>{text.sidebar.model}</span>
            <strong>{selectedProvider.model}</strong>
          </div>
          <div className="info-line">
            <span>{text.sidebar.api}</span>
            <strong className={selectedProvider.apiKeySet ? "green" : "amber"}>
              {selectedProvider.apiKeySet ? text.sidebar.connected : text.sidebar.notConfigured}
            </strong>
          </div>
          <div className="info-line">
            <span>{text.sidebar.provider}</span>
            <strong>{modelConfig.providers[modelConfig.selectedProvider].label}</strong>
          </div>
          <div className="info-line">
            <span>{text.sidebar.context}</span>
            <strong>{Math.round(selectedProvider.contextLength / 1000)}k</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

export function DesktopWorkbench(props: WorkbenchProps) {
  const { agentConfig, renderedPanel, panelPhase, closePanel, openPanel } = props;
  const text = getUiText(agentConfig.language);

  return (
    <main className="chat-only-layout" data-companion>
      {/* 顶部人格栏 */}
      <header className="companion-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            className="companion-avatar"
            style={{ background: agentConfig.accentColor || "#6366f1" }}
          >
            {agentConfig.avatar || "🤖"}
          </div>
          <div>
            <div className="companion-name">{agentConfig.name}</div>
            <div className="companion-status">
              <span className="live-dot" />
              在线
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={text.chat.search}
            onClick={() => openPanel("search")}
          >
            <Search size={20} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={text.chat.settings}
            onClick={() => openPanel("memory")}
          >
            <Database size={20} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={text.mobileSettings.expertTeams}
            onClick={() => openPanel("team")}
          >
            <Users size={20} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={text.chat.settings}
            onClick={() => openPanel("settings")}
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>
      </header>

      {/* 聊天区 */}
      <ChatPanel {...props} />

      {/* 设置抽屉（左侧滑出） */}
      {renderedPanel === "settings" && (
        <div
          className={`drawer-overlay ${panelPhase}`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closePanel(); }}
        >
          <div className={`drawer-panel left ${panelPhase}`}>
            <div className="drawer-head">
              <h2>{text.panels.settings}</h2>
              <button type="button" onClick={closePanel} aria-label={text.common.close}>
                <X size={20} />
              </button>
            </div>
            <DrawerSettingsPanel {...props} />
          </div>
        </div>
      )}

      {/* 记忆抽屉（右侧滑出） */}
      {renderedPanel === "memory" && (
        <div
          className={`drawer-overlay ${panelPhase}`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closePanel(); }}
        >
          <div className={`drawer-panel right ${panelPhase}`}>
            <div className="drawer-head">
              <h2>{text.panels.memory}</h2>
              <button type="button" onClick={closePanel} aria-label={text.common.close}>
                <X size={20} />
              </button>
            </div>
            <MemoryDetailPanel {...props} />
          </div>
        </div>
      )}
    </main>
  );
}

export function MobileWorkbench(props: WorkbenchProps & { mobileView: "chat" | "settings" }) {
  const { agentConfig, mobileView, openPanel } = props;
  const text = getUiText(agentConfig.language);

  return (
    <main className="mobile-shell" data-companion>
      {mobileView === "chat" ? (
        <MobileChat {...props} />
      ) : (
        <MobileSettings {...props} />
      )}
    </main>
  );
}
