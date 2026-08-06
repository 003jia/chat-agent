import { Download, MessageSquare, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Pencil, Search, Settings, Star, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { getUiText } from "../i18n";
import type { WorkbenchProps } from "../workbenchTypes";

export function DesktopSidebar({ collapsed, onCollapsedChange, ...props }: WorkbenchProps & {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const {
    agentConfig,
    roleStore,
    conversation,
    conversations,
    saving,
    busyAction,
    createConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
    toggleConversationStarred,
    exportConversation,
    setConversationRole,
    openPanel
  } = props;
  const [filter, setFilter] = useState("");
  const text = getUiText(agentConfig.language);
  const isEnglish = agentConfig.language === "en";
  const busy = saving && ["conversation-switch", "conversation-update"].includes(String(busyAction));
  const filteredConversations = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? conversations.filter((item) => item.title.toLowerCase().includes(query)) : conversations;
  }, [conversations, filter]);

  function handleRename(conversationId: string, currentTitle: string) {
    const title = window.prompt(agentConfig.language === "en" ? "Conversation name" : "会话名称", currentTitle);
    if (title?.trim() && title.trim() !== currentTitle) renameConversation(conversationId, title);
  }

  function handleDelete(conversationId: string) {
    if (conversations.length <= 1) return;
    if (window.confirm(text.sidebar.deleteConversationConfirm)) deleteConversation(conversationId);
  }

  return (
    <aside className={`desktop-conversation-sidebar ${collapsed ? "collapsed" : ""}`} aria-label={text.sidebar.conversations}>
      <header className="conversation-sidebar-head">
        <button type="button" className="sidebar-brand" onClick={() => onCollapsedChange(false)} aria-label={agentConfig.name}>
          <span className="sidebar-avatar" style={{ background: agentConfig.accentColor || "#6366f1" }}>{agentConfig.avatar || "🤖"}</span>
          {!collapsed && <span><strong>{agentConfig.name}</strong><small>{agentConfig.roleTitle}</small></span>}
        </button>
        <button
          type="button"
          className="sidebar-icon-button"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? (isEnglish ? "Expand sidebar" : "展开会话侧栏") : (isEnglish ? "Collapse sidebar" : "收起会话侧栏")}
          title={collapsed ? (isEnglish ? "Expand sidebar" : "展开会话侧栏") : (isEnglish ? "Collapse sidebar" : "收起会话侧栏")}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </header>

      <div className="conversation-sidebar-primary">
        <button type="button" className="new-conversation-button" onClick={() => createConversation({})} disabled={busy} title={text.sidebar.newConversation}>
          <MessageSquarePlus size={18} />
          {!collapsed && <span>{text.sidebar.newConversation}</span>}
        </button>
        <button type="button" className="sidebar-icon-button" onClick={() => openPanel("search")} aria-label={isEnglish ? "Search all conversations" : "搜索全部会话"} title={isEnglish ? "Search all conversations" : "搜索全部会话"}>
          <Search size={18} />
        </button>
      </div>

      {!collapsed && (
        <label className="conversation-filter">
          <Search size={15} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={isEnglish ? "Filter conversations" : "筛选会话名称"} />
        </label>
      )}

      <nav className="conversation-sidebar-list" aria-label={isEnglish ? "Local conversations" : "本地会话"}>
        {!collapsed && <span className="sidebar-section-label">{text.sidebar.conversations}</span>}
        <ul>
          {filteredConversations.map((item) => (
            <li key={item.id} className={item.id === conversation.id ? "active" : ""}>
              <button type="button" className="conversation-sidebar-item" onClick={() => switchConversation(item.id)} disabled={busy} title={item.title}>
                {item.starred ? <Star className="starred" size={16} fill="currentColor" /> : <MessageSquare size={16} />}
                {!collapsed && <span><strong>{item.title}</strong><small>{text.sidebar.messageCount(item.messageCount)}</small></span>}
              </button>
              {!collapsed && item.id === conversation.id && (
                <div className="conversation-row-actions">
                  <button type="button" onClick={() => toggleConversationStarred(item.id, !item.starred)} aria-label={item.starred ? (isEnglish ? "Unstar" : "取消置顶") : (isEnglish ? "Star conversation" : "置顶会话")} title={item.starred ? (isEnglish ? "Unstar" : "取消置顶") : (isEnglish ? "Star conversation" : "置顶会话")}><Star size={13} fill={item.starred ? "currentColor" : "none"} /></button>
                  <button type="button" onClick={() => handleRename(item.id, item.title)} aria-label={isEnglish ? "Rename conversation" : "重命名会话"} title={isEnglish ? "Rename conversation" : "重命名会话"}><Pencil size={13} /></button>
                  <button type="button" onClick={() => exportConversation(item.id)} aria-label={isEnglish ? "Export Markdown" : "导出 Markdown"} title={isEnglish ? "Export Markdown" : "导出 Markdown"}><Download size={13} /></button>
                  {conversations.length > 1 && <button type="button" className="danger" onClick={() => handleDelete(item.id)} aria-label={text.sidebar.deleteConversation} title={text.sidebar.deleteConversation}><Trash2 size={13} /></button>}
                </div>
              )}
            </li>
          ))}
        </ul>
        {!filteredConversations.length && !collapsed && <p className="sidebar-empty">{isEnglish ? "No matching conversations" : "没有匹配的会话"}</p>}
      </nav>

      <section className="conversation-sidebar-roles">
        {!collapsed && <span className="sidebar-section-label">{isEnglish ? "My copilots" : "我的搭档"}</span>}
        {roleStore.roles.slice(0, collapsed ? 4 : 5).map((role) => (
          <button
            type="button"
            key={role.id}
            className={role.id === agentConfig.id ? "active" : ""}
            onClick={() => setConversationRole(role.id)}
            title={role.name}
          >
            <span style={{ background: role.accentColor || "#6366f1" }}>{role.avatar || "🤖"}</span>
            {!collapsed && <strong>{role.name}</strong>}
          </button>
        ))}
      </section>

      <footer className="conversation-sidebar-footer">
        <button type="button" onClick={() => openPanel("team")} aria-label={isEnglish ? "Expert teams" : "专家团"} title={isEnglish ? "Expert teams" : "专家团"}><Users size={18} />{!collapsed && <span>{isEnglish ? "Teams" : "专家团"}</span>}</button>
        <button type="button" onClick={() => openPanel("settings")} aria-label={text.chat.settings} title={text.chat.settings}><Settings size={18} />{!collapsed && <span>{text.chat.settings}</span>}</button>
      </footer>
    </aside>
  );
}
