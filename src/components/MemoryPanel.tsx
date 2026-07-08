import { ChevronLeft, ChevronRight, ClipboardList, CheckCircle2, FileText, Loader2 } from "lucide-react";
import type { MemoryItem } from "../types";
import type { WorkbenchProps } from "../workbenchTypes";
import { formatEditedAgo, LevelBadge, MemoryCard, Stat } from "./ui";

export function MemoryPanel({ memoryState, pendingCandidates, saving, busyAction, memoryFeedbackKey, memoryPanelCollapsed, commitCandidates, rejectMemoryItem, editMemoryItem, openPanel, toggleMemoryPanel }: WorkbenchProps) {
  const active = memoryState.items.filter((item) => item.status === "active");
  const candidates = mergeCandidates(pendingCandidates, memoryState.items.filter((item) => item.status === "candidate"));
  const committing = busyAction === "memory-commit";

  if (memoryPanelCollapsed) {
    return (
      <aside className="memory-panel memory-panel-collapsed">
        <button type="button" className="memory-panel-toggle" onClick={toggleMemoryPanel} aria-label="展开长期记忆面板" title="展开长期记忆面板">
          <ChevronLeft size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="memory-panel">
      <div className="memory-title">
        <span>长期记忆</span>
        <strong>记忆上下文</strong>
        <button type="button" className="memory-panel-toggle" onClick={toggleMemoryPanel} aria-label="收起长期记忆面板" title="收起长期记忆面板">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="stats-card" key={memoryFeedbackKey}>
        <Stat value={String(memoryState.stats.loaded)} label="已加载" />
        <Stat value={String(candidates.length)} label="候选" />
        <Stat value={`${memoryState.stats.editedMinutesAgo}m`} label="更新" />
      </div>

      <button className="open-memory" onClick={() => openPanel("memory")} type="button">
        <FileText size={17} /> 打开 memory.md <ChevronRight size={17} />
      </button>

      <section className="memory-section">
        <div className="memory-section-head">
          <h3>已加载记忆</h3>
          <span>{active.length} 条有效</span>
        </div>
        <div className="memory-list">
          {active.slice(0, 5).map((item) => (
            <MemoryCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section className="memory-section">
        <div className="memory-section-head">
          <h3>候选记忆</h3>
          <button type="button" onClick={() => commitCandidates(candidates)} disabled={!candidates.length || saving}>
            {committing ? "保存中" : `审核 ${candidates.length}`}
          </button>
        </div>
        <div className="candidate-table">
          <div className="candidate-row header">
            <span>记忆</span>
            <span>等级</span>
            <span>操作</span>
          </div>
          {candidates.slice(0, 5).map((item) => (
            <div className="candidate-row" key={item.id}>
              <div className="candidate-content">
                <strong>{item.op === "update" ? "更新" : "新增"} · {humanMemoryType(item.type)}</strong>
                <span>{item.content}</span>
              </div>
              <LevelBadge level={item.level} />
              <div className="candidate-actions">
                <button type="button" onClick={() => commitCandidates([item])} disabled={saving}>接受</button>
                <button type="button" onClick={() => editMemoryItem(item)} disabled={saving}>编辑</button>
                <button type="button" onClick={() => rejectMemoryItem(item.id)} disabled={saving}>拒绝</button>
              </div>
            </div>
          ))}
          {!candidates.length && <p className="empty-copy">暂无候选记忆。</p>}
        </div>
      </section>

      <div className="source-card">
        <span><CheckCircle2 size={16} /> {formatEditedAgo(memoryState.stats.editedMinutesAgo)}</span>
        <code>source: data/memory/memory.md</code>
      </div>
    </aside>
  );
}

export function MemoryDetailPanel({ memoryState, pendingCandidates, saving, busyAction, commitCandidates, rejectMemoryItem, editMemoryItem, organizeMemory }: WorkbenchProps) {
  const candidates = mergeCandidates(pendingCandidates, memoryState.items.filter((item) => item.status === "candidate"));
  const committing = busyAction === "memory-commit";
  const organizing = busyAction === "memory-organize";
  return (
    <div className="drawer-body">
      <div className="drawer-actions">
        <button type="button" onClick={organizeMemory} disabled={organizing || saving}>
          {organizing ? <Loader2 className="spin" size={16} /> : <FileText size={16} />}
          {organizing ? "整理中" : "整理 memory.md"}
        </button>
        <button type="button" onClick={() => commitCandidates(candidates)} disabled={committing || saving}>
          {committing ? <Loader2 className="spin" size={16} /> : <ClipboardList size={16} />}
          {committing ? "提交中" : `提交候选 ${candidates.length}`}
        </button>
      </div>
      <section className="drawer-section">
        <h3>候选记忆</h3>
        <div className="result-list">
          {candidates.map((item) => (
            <div className="result-row" key={item.id}>
              <strong>{item.op === "update" ? "更新" : "新增"} · {item.level} · {item.type}</strong>
              <p>{item.content}</p>
              <div className="candidate-actions inline">
                <button type="button" onClick={() => commitCandidates([item])} disabled={saving}>接受</button>
                <button type="button" onClick={() => editMemoryItem(item)} disabled={saving}>编辑</button>
                <button type="button" onClick={() => rejectMemoryItem(item.id)} disabled={saving}>拒绝</button>
              </div>
            </div>
          ))}
          {!candidates.length && <p className="empty-copy">暂无候选记忆。发送包含“记住/偏好/以后/不要”的消息后会生成候选。</p>}
        </div>
      </section>
      <section className="drawer-section">
        <h3>当前 memory.md</h3>
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

function humanMemoryType(type: string) {
  const labels: Record<string, string> = {
    user_preference: "偏好",
    project_fact: "事实",
    conversation_summary: "摘要"
  };
  return labels[type] || type;
}
