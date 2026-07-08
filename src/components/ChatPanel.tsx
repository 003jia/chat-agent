import { Bot, BrainCircuit, Database, FileText, Globe2, Loader2, Mic, Paperclip, Search, Send, SlidersHorizontal, Wrench } from "lucide-react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { Conversation } from "../types";
import type { WorkbenchProps } from "../workbenchTypes";
import { IconButton, Segmented } from "./ui";

export function ChatPanel({
  agentConfig,
  conversation,
  draft,
  sending,
  status,
  statusKey,
  error,
  activeMode,
  setDraft,
  updateAgent,
  sendMessage,
  pendingCandidates,
  openPanel,
  chooseMode,
  generateSummary,
  handleAttachment,
  handleVoice
}: WorkbenchProps) {
  const scrollRef = useAutoScroll(conversation);
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

      <div className="chat-scroll" ref={scrollRef}>
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
          <button type="button" className={activeMode === "web" ? "active" : ""} onClick={() => chooseMode("web")}><Globe2 size={16} />联网搜索</button>
          <button type="button" onClick={generateSummary}><FileText size={16} />生成摘要</button>
          <button type="button" className={activeMode === "tools" ? "active" : ""} onClick={() => chooseMode("tools")}><Wrench size={16} />调用工具</button>
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <button type="button" aria-label="附件" onClick={handleAttachment}><Paperclip size={21} /></button>
          <button type="button" aria-label="语音" onClick={handleVoice}><Mic size={21} /></button>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="发消息，或让智能体记住一件事..." />
          <button className={`send-button ${sending ? "is-sending" : ""}`} type="submit" disabled={sending}>
            {sending ? <Loader2 className="spin" size={22} /> : <Send size={24} />}
          </button>
        </form>
        <div className="status-line" key={statusKey}>{pendingCandidates.length ? `候选记忆 ${pendingCandidates.length} 条 · ${status}` : status}</div>
      </footer>
    </section>
  );
}

export function MobileChat(props: WorkbenchProps) {
  const { agentConfig, memoryState, conversation, pendingCandidates, activeMode, setMobileView, updateAgent, chooseMode } = props;
  const scrollRef = useAutoScroll(conversation);
  return (
    <section className="phone-frame motion-page">
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
      <div className="mobile-chat-list" ref={scrollRef}>
        {conversation.messages.map((message) => <MessageBubble key={message.id} message={message} compact />)}
      </div>
      <div className="mobile-composer">
        <div className="mobile-quick-actions">
          <button type="button" className={activeMode === "thinking" ? "active" : ""} onClick={() => chooseMode("thinking")}><BrainCircuit size={15} />思考</button>
          <button type="button" className={activeMode === "memory" ? "active" : ""} onClick={() => chooseMode("memory")}><Database size={15} />记忆</button>
          <button type="button" className={activeMode === "web" ? "active" : ""} onClick={() => chooseMode("web")}><Globe2 size={15} />搜索</button>
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
      <button className={`send-button ${sending ? "is-sending" : ""}`} type="submit" disabled={sending}>{sending ? <Loader2 className="spin" size={20} /> : <Send size={22} />}</button>
    </form>
  );
}

export function MessageBubble({ message, compact = false }: { message: Conversation["messages"][number]; compact?: boolean }) {
  const isUser = message.role === "user";
  return (
    <article className={`message-row ${isUser ? "user" : "assistant"} ${compact ? "compact" : ""}`}>
      {!isUser && (
        <div className="avatar">
          <Bot size={17} />
        </div>
      )}
      <div>
        <div className="bubble markdown-body">
          {message.content.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {message.content}
            </ReactMarkdown>
          ) : (
            <span className="typing-placeholder">正在生成...</span>
          )}
        </div>
        <small>{isUser ? "" : message.memoryRefs.length ? `引用 ${message.memoryRefs.length} 条记忆` : message.candidateMemoryIds.length ? `候选记忆 ${message.candidateMemoryIds.length} 条` : ""}</small>
      </div>
    </article>
  );
}

function useAutoScroll(conversation: Conversation) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latestMessage = conversation.messages[conversation.messages.length - 1];
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [conversation.id, conversation.messages.length, latestMessage?.id, latestMessage?.content.length]);
  return scrollRef;
}
