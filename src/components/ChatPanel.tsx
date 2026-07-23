import { Bot, BrainCircuit, Copy, Database, FileText, Globe2, Loader2, RefreshCw, Search, Send, SlidersHorizontal, Wrench } from "lucide-react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { getUiText, type UiLanguage } from "../i18n";
import type { Conversation, MemoryItem } from "../types";
import type { WorkbenchProps } from "../workbenchTypes";
import { IconButton, Segmented } from "./ui";

export function ChatPanel({
  agentConfig,
  conversation,
  memoryState,
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
  handleVoice,
  copyMessage,
  regenerateMessage
}: WorkbenchProps) {
  const scrollRef = useAutoScroll(conversation);
  const text = getUiText(agentConfig.language);
  const memoryById = new Map(memoryState.items.map((item) => [item.id, item]));
  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div>
          <h2>{conversation.title}</h2>
          <p><span className="blue-dot" />{agentConfig.name} · {text.chat.loadedMemoryTools}</p>
        </div>
        <div className="header-actions">
          <IconButton label={text.chat.search} onClick={() => openPanel("search")}><Search size={20} /></IconButton>
          <IconButton label={text.chat.settings} onClick={() => openPanel("settings")}><SlidersHorizontal size={20} /></IconButton>
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
          <span>{text.chat.memoryToast}</span>
        </div>
        {conversation.messages.map((message) => (
          <MessageBubble key={message.id} message={message} language={agentConfig.language} referencedMemories={message.memoryRefs.map((id) => memoryById.get(id)).filter(Boolean) as MemoryItem[]} onCopy={copyMessage} onRegenerate={regenerateMessage} />
        ))}
        {error && <div className="error-banner">{error}</div>}
      </div>

      <footer className="composer-zone">
        {agentConfig.quickPrompts?.length ? (
          <div className="role-quick-prompts" aria-label={text.chat.roleQuickPrompts}>
            {agentConfig.quickPrompts.map((prompt) => (
              <button type="button" key={prompt} onClick={() => setDraft(prompt)}>{prompt}</button>
            ))}
          </div>
        ) : null}
        <div className="quick-actions">
          <button type="button" className={activeMode === "thinking" ? "active" : ""} aria-pressed={activeMode === "thinking"} onClick={() => chooseMode("thinking")}><BrainCircuit size={16} />{text.chat.thinking}</button>
          <button type="button" className={activeMode === "memory" ? "active" : ""} aria-pressed={activeMode === "memory"} onClick={() => chooseMode("memory")}><Database size={16} />{text.chat.organizeMemory}</button>
          <button type="button" onClick={generateSummary}><FileText size={16} />{text.chat.summary}</button>
          <button type="button" className={activeMode === "tools" ? "active" : ""} aria-pressed={activeMode === "tools"} onClick={() => chooseMode("tools")}><Wrench size={16} />{text.chat.tools}</button>
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={text.chat.placeholder} />
          <button className={`send-button ${sending ? "is-sending" : ""}`} type="submit" aria-label={text.chat.send} disabled={sending}>
            {sending ? <Loader2 className="spin" size={22} /> : <Send size={24} />}
          </button>
        </form>
        <div className="status-line" key={statusKey}>{pendingCandidates.length ? `${text.chat.candidates(pendingCandidates.length)} · ${status}` : status}</div>
      </footer>
    </section>
  );
}

export function MobileChat(props: WorkbenchProps) {
  const { agentConfig, memoryState, conversation, pendingCandidates, activeMode, setMobileView, updateAgent, chooseMode, copyMessage, regenerateMessage, setDraft } = props;
  const scrollRef = useAutoScroll(conversation);
  const text = getUiText(agentConfig.language);
  const memoryById = new Map(memoryState.items.map((item) => [item.id, item]));
  return (
    <section className="phone-frame motion-page">
      <div className="phone-status"><strong>9:41</strong><span>⌁ ◔ ▱</span></div>
      <header className="mobile-header">
        <div>
          <h1>{agentConfig.name}</h1>
          <p><span className="live-dot" />{text.chat.memoriesLoaded(memoryState.stats.loaded)}</p>
        </div>
        <div className="mobile-actions">
          <button type="button" aria-label={text.chat.settings} onClick={() => setMobileView("settings")}><SlidersHorizontal size={18} /></button>
          <Segmented
            value={agentConfig.language}
            options={[["zh", "中"], ["en", "EN"]]}
            onChange={(value) => updateAgent({ ...agentConfig, language: value as "zh" | "en" })}
          />
        </div>
      </header>
      <div className="mobile-note">
        <BrainCircuit size={20} />
        <span>{text.chat.mobileNote}</span>
      </div>
      <div className="mobile-chat-list" ref={scrollRef}>
        {conversation.messages.map((message) => <MessageBubble key={message.id} message={message} language={agentConfig.language} referencedMemories={message.memoryRefs.map((id) => memoryById.get(id)).filter(Boolean) as MemoryItem[]} compact onCopy={copyMessage} onRegenerate={regenerateMessage} />)}
      </div>
      <div className="mobile-composer">
        {agentConfig.quickPrompts?.length ? (
          <div className="role-quick-prompts mobile" aria-label={text.chat.roleQuickPrompts}>
            {agentConfig.quickPrompts.map((prompt) => (
              <button type="button" key={prompt} onClick={() => setDraft(prompt)}>{prompt}</button>
            ))}
          </div>
        ) : null}
        <div className="mobile-quick-actions">
          <button type="button" className={activeMode === "thinking" ? "active" : ""} aria-pressed={activeMode === "thinking"} onClick={() => chooseMode("thinking")}><BrainCircuit size={15} />{text.chat.mobileThinking}</button>
          <button type="button" className={activeMode === "memory" ? "active" : ""} aria-pressed={activeMode === "memory"} onClick={() => chooseMode("memory")}><Database size={15} />{text.chat.mobileMemory}</button>
          <button type="button" className={activeMode === "web" ? "active" : ""} aria-pressed={activeMode === "web"} onClick={() => chooseMode("web")}><Globe2 size={15} />{text.chat.mobileSearch}</button>
          <button type="button" className={activeMode === "tools" ? "active" : ""} aria-pressed={activeMode === "tools"} onClick={() => chooseMode("tools")}><Wrench size={15} />{text.chat.mobileTools}</button>
        </div>
        <ChatPanelMini {...props} />
        <span>{pendingCandidates.length ? text.chat.candidates(pendingCandidates.length) : text.chat.candidatesHint}</span>
      </div>
    </section>
  );
}

function ChatPanelMini({ agentConfig, draft, sending, setDraft, sendMessage }: WorkbenchProps) {
  const text = getUiText(agentConfig.language);
  return (
    <form className="composer mobile" onSubmit={sendMessage}>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={text.chat.placeholder} />
      <button className={`send-button ${sending ? "is-sending" : ""}`} type="submit" aria-label={text.chat.send} disabled={sending}>{sending ? <Loader2 className="spin" size={20} /> : <Send size={22} />}</button>
    </form>
  );
}

export function MessageBubble({ message, compact = false, language = "zh", referencedMemories = [], onCopy, onRegenerate, isStreaming = false }: {
  message: Conversation["messages"][number];
  compact?: boolean;
  language?: UiLanguage;
  referencedMemories?: MemoryItem[];
  onCopy?: (content: string) => void;
  onRegenerate?: () => void;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const text = getUiText(language);
  const hasMemoryRefs = !isUser && message.memoryRefs.length > 0;
  const isEmptyAssistant = !isUser && !message.content.trim();
  const isActivelyStreaming = isStreaming && isEmptyAssistant;
  const timeLabel = formatMessageTime(message.timestamp, language);
  return (
    <article className={`message-row ${isUser ? "user" : "assistant"} ${compact ? "compact" : ""}`}>
      {!isUser && (
        <div className={`avatar ${isActivelyStreaming ? "typing-pulse" : ""}`}>
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
            <span className="typing-placeholder">{text.chat.typing}</span>
          )}
        </div>
        {timeLabel && <div className="message-time">{timeLabel}</div>}
        {!isUser && (
          <div className="message-actions">
            {onCopy && (
              <button type="button" onClick={() => onCopy(message.content)} aria-label={text.companion.copy || "复制"}>
                <Copy size={14} />
              </button>
            )}
            {onRegenerate && (
              <button type="button" onClick={onRegenerate} aria-label={text.companion.regenerate || "重新生成"}>
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        )}
        {isUser && onCopy && message.content.trim() && (
          <div className="message-actions">
            <button type="button" onClick={() => onCopy(message.content)} aria-label={text.companion.copy || "复制"}>
              <Copy size={14} />
            </button>
          </div>
        )}
        {hasMemoryRefs && referencedMemories.length ? (
          <details className="memory-footnote">
            <summary>{text.companion.memory.footnote(referencedMemories.length)}</summary>
            <ul>
              {referencedMemories.map((item) => (
                <li key={item.id}>
                  <strong>{item.level}</strong>
                  <span>{item.content}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <small>{isUser ? "" : message.memoryRefs.length ? text.companion.memory.footnote(message.memoryRefs.length) : message.candidateMemoryIds.length ? text.chat.candidates(message.candidateMemoryIds.length) : ""}</small>
        )}
      </div>
    </article>
  );
}

function formatMessageTime(timestamp: string, language: UiLanguage): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (isToday) return `${hours}:${minutes}`;
  if (isYesterday) return language === "en" ? `Yesterday ${hours}:${minutes}` : `昨天 ${hours}:${minutes}`;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function useAutoScroll(conversation: Conversation) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const latestMessage = conversation.messages[conversation.messages.length - 1];
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const firstPositionForConversation = previousConversationIdRef.current !== conversation.id;
    previousConversationIdRef.current = conversation.id;
    element.scrollTo({ top: element.scrollHeight, behavior: firstPositionForConversation ? "auto" : "smooth" });
  }, [conversation.id, conversation.messages.length, latestMessage?.id, latestMessage?.content.length]);
  return scrollRef;
}
