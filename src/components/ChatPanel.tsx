import { Bot, BrainCircuit, Database, FileText, Globe2, Loader2, Mic, Paperclip, Search, Send, SlidersHorizontal, Wrench } from "lucide-react";
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
  handleVoice
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
          <MessageBubble key={message.id} message={message} language={agentConfig.language} referencedMemories={message.memoryRefs.map((id) => memoryById.get(id)).filter(Boolean) as MemoryItem[]} />
        ))}
        {error && <div className="error-banner">{error}</div>}
      </div>

      <footer className="composer-zone">
        <div className="quick-actions">
          <button type="button" className={activeMode === "thinking" ? "active" : ""} aria-pressed={activeMode === "thinking"} onClick={() => chooseMode("thinking")}><BrainCircuit size={16} />{text.chat.thinking}</button>
          <button type="button" className={activeMode === "memory" ? "active" : ""} aria-pressed={activeMode === "memory"} onClick={() => chooseMode("memory")}><Database size={16} />{text.chat.organizeMemory}</button>
          <button type="button" className={activeMode === "web" ? "active" : ""} aria-pressed={activeMode === "web"} onClick={() => chooseMode("web")}><Globe2 size={16} />{text.chat.webSearch}</button>
          <button type="button" onClick={generateSummary}><FileText size={16} />{text.chat.summary}</button>
          <button type="button" className={activeMode === "tools" ? "active" : ""} aria-pressed={activeMode === "tools"} onClick={() => chooseMode("tools")}><Wrench size={16} />{text.chat.tools}</button>
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <button type="button" aria-label={text.chat.attach} onClick={handleAttachment}><Paperclip size={21} /></button>
          <button type="button" aria-label={text.chat.voice} onClick={handleVoice}><Mic size={21} /></button>
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
  const { agentConfig, memoryState, conversation, pendingCandidates, activeMode, setMobileView, updateAgent, chooseMode } = props;
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
        {conversation.messages.map((message) => <MessageBubble key={message.id} message={message} language={agentConfig.language} referencedMemories={message.memoryRefs.map((id) => memoryById.get(id)).filter(Boolean) as MemoryItem[]} compact />)}
      </div>
      <div className="mobile-composer">
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

function ChatPanelMini({ agentConfig, draft, sending, setDraft, sendMessage, handleAttachment }: WorkbenchProps) {
  const text = getUiText(agentConfig.language);
  return (
    <form className="composer mobile" onSubmit={sendMessage}>
      <button type="button" aria-label={text.chat.attach} onClick={handleAttachment}><Paperclip size={20} /></button>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={text.chat.placeholder} />
      <button className={`send-button ${sending ? "is-sending" : ""}`} type="submit" aria-label={text.chat.send} disabled={sending}>{sending ? <Loader2 className="spin" size={20} /> : <Send size={22} />}</button>
    </form>
  );
}

export function MessageBubble({ message, compact = false, language = "zh", referencedMemories = [] }: { message: Conversation["messages"][number]; compact?: boolean; language?: UiLanguage; referencedMemories?: MemoryItem[] }) {
  const isUser = message.role === "user";
  const text = getUiText(language);
  const hasMemoryRefs = !isUser && message.memoryRefs.length > 0;
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
            <span className="typing-placeholder">{text.chat.typing}</span>
          )}
        </div>
        {hasMemoryRefs && referencedMemories.length ? (
          <details className="memory-ref-details">
            <summary>{text.chat.referenced(message.memoryRefs.length)}</summary>
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
          <small>{isUser ? "" : message.memoryRefs.length ? text.chat.referenced(message.memoryRefs.length) : message.candidateMemoryIds.length ? text.chat.candidates(message.candidateMemoryIds.length) : ""}</small>
        )}
      </div>
    </article>
  );
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
