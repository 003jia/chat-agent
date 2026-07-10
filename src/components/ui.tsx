import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { formatEditedAgoText, memoryLevelLabel, memoryTypeLabel, type UiLanguage } from "../i18n";
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
    <div className="segmented" role="group">
      {options.map(([optionValue, label]) => (
        <button key={optionValue} type="button" aria-pressed={value === optionValue} className={value === optionValue ? "active" : ""} onClick={() => onChange?.(optionValue)}>
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

export function MemoryCard({ item, language, actions }: { item: MemoryItem; language?: UiLanguage; actions?: ReactNode }) {
  return (
    <div className="memory-card">
      <div>
        <strong>{humanizeMemoryType(item.type, language)}</strong>
        <p>{item.content}</p>
      </div>
      <LevelBadge level={item.level} language={language} />
      {actions && <div className="memory-card-actions">{actions}</div>}
    </div>
  );
}

export function LevelBadge({ level, language }: { level: MemoryItem["level"]; language?: UiLanguage }) {
  return <span className={`level ${level}`}>{memoryLevelLabel(level, language)}</span>;
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

export function humanizeMemoryType(type: string, language?: UiLanguage) {
  return memoryTypeLabel(type, language);
}

export function formatEditedAgo(minutes: number, language?: UiLanguage) {
  return formatEditedAgoText(minutes, language);
}
