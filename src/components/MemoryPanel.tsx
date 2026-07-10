import { ChevronLeft, ChevronRight, ClipboardList, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { getUiText, memoryTypeLabel } from "../i18n";
import type { MemoryItem } from "../types";
import type { WorkbenchProps } from "../workbenchTypes";
import { formatEditedAgo, LevelBadge, MemoryCard, Stat } from "./ui";

export function MemoryPanel({ agentConfig, memoryState, pendingCandidates, saving, busyAction, memoryFeedbackKey, memoryPanelCollapsed, commitCandidates, rejectMemoryItem, editMemoryItem, updateMemoryItem, deleteMemoryItem, openPanel, toggleMemoryPanel }: WorkbenchProps) {
  const active = memoryState.items.filter((item) => item.status === "active");
  const candidates = mergeCandidates(pendingCandidates, memoryState.items.filter((item) => item.status === "candidate"));
  const committing = busyAction === "memory-commit";
  const text = getUiText(agentConfig.language);

  if (memoryPanelCollapsed) {
    return (
      <aside className="memory-panel memory-panel-collapsed">
        <button type="button" className="memory-panel-toggle" onClick={toggleMemoryPanel} aria-label={text.memory.expand} title={text.memory.expand}>
          <ChevronLeft size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="memory-panel">
      <div className="memory-title">
        <span>{text.memory.longTerm}</span>
        <strong>{text.memory.context}</strong>
        <button type="button" className="memory-panel-toggle" onClick={toggleMemoryPanel} aria-label={text.memory.collapse} title={text.memory.collapse}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="stats-card" key={memoryFeedbackKey}>
        <Stat value={String(memoryState.stats.loaded)} label={text.memory.loaded} />
        <Stat value={String(candidates.length)} label={text.memory.candidates} />
        <Stat value={`${memoryState.stats.editedMinutesAgo}m`} label={text.memory.updated} />
      </div>

      <button className="open-memory" onClick={() => openPanel("memory")} type="button">
        <FileText size={17} /> {text.memory.openMemory} <ChevronRight size={17} />
      </button>

      <section className="memory-section">
        <div className="memory-section-head">
          <h3>{text.memory.loadedMemories}</h3>
          <span>{text.memory.validCount(active.length)}</span>
        </div>
        <div className="memory-list">
          {active.slice(0, 5).map((item) => (
            <MemoryCard
              key={item.id}
              item={item}
              language={agentConfig.language}
              actions={(
                <>
                  <button type="button" onClick={() => editMemoryItem(item)} disabled={saving}>{text.common.edit}</button>
                  <button type="button" onClick={() => updateMemoryItem(item.id, { status: "disabled" })} disabled={saving}>{agentConfig.language === "en" ? "Disable" : "禁用"}</button>
                  <button type="button" onClick={() => confirmDeleteMemory(item, deleteMemoryItem, agentConfig.language)} disabled={saving}>{agentConfig.language === "en" ? "Delete" : "删除"}</button>
                </>
              )}
            />
          ))}
        </div>
      </section>

      <section className="memory-section">
        <div className="memory-section-head">
          <h3>{text.memory.candidateMemories}</h3>
          <button type="button" onClick={() => commitCandidates(candidates)} disabled={!candidates.length || saving}>
            {committing ? text.memory.saving : text.memory.review(candidates.length)}
          </button>
        </div>
        <div className="candidate-table">
          <div className="candidate-row header">
            <span>{text.memory.memory}</span>
            <span>{text.memory.level}</span>
            <span>{text.memory.action}</span>
          </div>
          {candidates.slice(0, 5).map((item) => (
            <div className="candidate-row" key={item.id}>
              <div className="candidate-content">
                <strong>{operationLabel(item, agentConfig.language)} · {humanMemoryType(item.type, agentConfig.language)}</strong>
                <span>{item.content}</span>
                {item.reason && <em>{item.reason}</em>}
              </div>
              <LevelBadge level={item.level} language={agentConfig.language} />
              <div className="candidate-actions">
                <button type="button" onClick={() => commitCandidates([item])} disabled={saving}>{text.common.accept}</button>
                <button type="button" onClick={() => editMemoryItem(item)} disabled={saving}>{text.common.edit}</button>
                <button type="button" onClick={() => rejectMemoryItem(item.id)} disabled={saving}>{text.common.reject}</button>
              </div>
            </div>
          ))}
          {!candidates.length && <p className="empty-copy">{text.memory.emptyCandidates}</p>}
        </div>
      </section>

      <div className="source-card">
        <span><CheckCircle2 size={16} /> {formatEditedAgo(memoryState.stats.editedMinutesAgo, agentConfig.language)}</span>
        <code>source: data/memory/memory.md</code>
      </div>
    </aside>
  );
}

export function MemoryDetailPanel({ agentConfig, memoryState, pendingCandidates, saving, busyAction, commitCandidates, rejectMemoryItem, editMemoryItem, updateMemoryItem, deleteMemoryItem, organizeMemory }: WorkbenchProps) {
  const candidates = mergeCandidates(pendingCandidates, memoryState.items.filter((item) => item.status === "candidate"));
  const committing = busyAction === "memory-commit";
  const organizing = busyAction === "memory-organize";
  const text = getUiText(agentConfig.language);
  return (
    <div className="drawer-body">
      <div className="drawer-actions">
        <button type="button" onClick={organizeMemory} disabled={organizing || saving}>
          {organizing ? <Loader2 className="spin" size={16} /> : <FileText size={16} />}
          {organizing ? text.memory.organizing : text.memory.organize}
        </button>
        <button type="button" onClick={() => commitCandidates(candidates)} disabled={committing || saving}>
          {committing ? <Loader2 className="spin" size={16} /> : <ClipboardList size={16} />}
          {committing ? text.memory.committing : text.memory.commitCandidates(candidates.length)}
        </button>
      </div>
      <section className="drawer-section">
        <h3>{text.memory.candidateMemories}</h3>
        <div className="result-list">
          {candidates.map((item) => (
            <div className="result-row" key={item.id}>
              <strong>{operationLabel(item, agentConfig.language)} · {item.level} · {humanMemoryType(item.type, agentConfig.language)}</strong>
              <p>{item.content}</p>
              {item.reason && <small>{item.reason}</small>}
              <div className="candidate-actions inline">
                <button type="button" onClick={() => commitCandidates([item])} disabled={saving}>{text.common.accept}</button>
                <button type="button" onClick={() => editMemoryItem(item)} disabled={saving}>{text.common.edit}</button>
                <button type="button" onClick={() => rejectMemoryItem(item.id)} disabled={saving}>{text.common.reject}</button>
              </div>
            </div>
          ))}
          {!candidates.length && <p className="empty-copy">{text.memory.emptyCandidatesHint}</p>}
        </div>
      </section>
      <section className="drawer-section">
        <h3>{text.memory.loadedMemories}</h3>
        <div className="result-list">
          {memoryState.items.filter((item) => item.status === "active").map((item) => (
            <div className="result-row" key={item.id}>
              <strong>{humanMemoryType(item.type, agentConfig.language)} · {item.level}</strong>
              <p>{item.content}</p>
              <div className="candidate-actions inline">
                <button type="button" onClick={() => editMemoryItem(item)} disabled={saving}>{text.common.edit}</button>
                <button type="button" onClick={() => updateMemoryItem(item.id, { status: "disabled" })} disabled={saving}>{agentConfig.language === "en" ? "Disable" : "禁用"}</button>
                <button type="button" onClick={() => confirmDeleteMemory(item, deleteMemoryItem, agentConfig.language)} disabled={saving}>{agentConfig.language === "en" ? "Delete" : "删除"}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="drawer-section">
        <h3>{text.memory.currentMemory}</h3>
        <pre className="markdown-preview">{memoryState.markdown}</pre>
      </section>
    </div>
  );
}

function mergeCandidates(primary: MemoryItem[], secondary: MemoryItem[]) {
  const byId = new Map<string, MemoryItem>();
  for (const item of [...primary, ...secondary]) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values()).filter((item) => item.status === "candidate");
}

function humanMemoryType(type: string, language?: "zh" | "en") {
  return memoryTypeLabel(type, language, true);
}

function operationLabel(item: MemoryItem, language: "zh" | "en") {
  if (item.op === "disable") return language === "en" ? "Disable" : "禁用";
  if (item.op === "update") return language === "en" ? "Update" : "更新";
  return language === "en" ? "Add" : "新增";
}

function confirmDeleteMemory(item: MemoryItem, deleteMemoryItem: (memoryId: string) => Promise<void>, language: "zh" | "en") {
  const message = language === "en" ? "Delete this memory permanently?" : "确定永久删除这条记忆吗？";
  if (!window.confirm(message)) return;
  deleteMemoryItem(item.id);
}
