import { Loader2, Send } from "lucide-react";
import { getUiText } from "../i18n";
import type { WorkbenchProps } from "../workbenchTypes";

export function WelcomeScreen({ agentConfig, draft, sending, setDraft, sendMessage }: Pick<WorkbenchProps, "agentConfig" | "draft" | "sending" | "setDraft" | "sendMessage">) {
  const text = getUiText(agentConfig.language);
  const isEnglish = agentConfig.language === "en";
  const title = isEnglish ? "What's on your mind today?" : "今天有什么计划？";
  const quickPrompts = agentConfig.quickPrompts?.length ? agentConfig.quickPrompts : [];

  return (
    <div className="welcome-screen">
      <div className="welcome-screen-inner">
        <h1>{title}</h1>
        <form className="composer welcome-composer" onSubmit={sendMessage}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={text.chat.placeholder}
            autoFocus
          />
          <button className={`send-button ${sending ? "is-sending" : ""}`} type="submit" aria-label={text.chat.send} disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="spin" size={22} /> : <Send size={24} />}
          </button>
        </form>
        {quickPrompts.length ? (
          <div className="welcome-quick-prompts" aria-label={text.chat.roleQuickPrompts}>
            {quickPrompts.map((prompt) => (
              <button type="button" key={prompt} onClick={() => setDraft(prompt)}>{prompt}</button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
