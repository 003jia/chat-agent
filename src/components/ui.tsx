import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { MemoryItem } from "../types";

export function ToggleRow({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{title}</strong>
        <em>{subtitle}</em>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange?: (value: string) => void }) {
  return (
    <div className="segmented">
      {options.map(([optionValue, label]) => (
        <button key={optionValue} type="button" className={value === optionValue ? "active" : ""} onClick={() => onChange?.(optionValue)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return <button className="icon-button" aria-label={label} type="button" onClick={onClick}>{children}</button>;
}

export function InfoLine({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  return (
    <div className="info-line">
      <span>{label}</span>
      <strong className={tone || ""}>{value}</strong>
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function MemoryCard({ item }: { item: MemoryItem }) {
  return (
    <div className="memory-card">
      <div>
        <strong>{humanizeMemoryType(item.type)}</strong>
        <p>{item.content}</p>
      </div>
      <LevelBadge level={item.level} />
    </div>
  );
}

export function LevelBadge({ level }: { level: MemoryItem["level"] }) {
  return <span className={`level ${level}`}>{level === "high" ? "高" : level === "medium" ? "中" : "低"}</span>;
}

export function MobileSettingRow({ icon, label, value, onClick }: { icon: ReactNode; label: string; value: string; onClick?: () => void }) {
  return (
    <button className="mobile-setting-row" type="button" onClick={onClick}>
      <span>{icon}</span>
      <div>
        <em>{label}</em>
        <strong>{value}</strong>
      </div>
      <ChevronRight size={16} />
    </button>
  );
}

export function humanizeMemoryType(type: string) {
  const labels: Record<string, string> = {
    user_preference: "用户偏好",
    project_fact: "项目事实",
    conversation_summary: "会话摘要"
  };
  return labels[type] || type;
}

export function formatEditedAgo(minutes: number) {
  if (minutes <= 0) return "刚刚更新";
  if (minutes === 1) return "1 分钟前更新";
  return `${minutes} 分钟前更新`;
}
