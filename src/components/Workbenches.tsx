import type { WorkbenchProps } from "../workbenchTypes";
import { AgentSidebar, MobileSettings } from "./SettingsPanels";
import { ChatPanel, MobileChat } from "./ChatPanel";
import { MemoryPanel } from "./MemoryPanel";

export function DesktopWorkbench(props: WorkbenchProps) {
  return (
    <main className={`desktop-shell ${props.memoryPanelCollapsed ? "memory-collapsed" : ""}`}>
      <AgentSidebar {...props} />
      <ChatPanel {...props} />
      <MemoryPanel {...props} />
    </main>
  );
}

export function MobileWorkbench(props: WorkbenchProps & { mobileView: "chat" | "settings" }) {
  return (
    <main className={`mobile-shell view-${props.mobileView}`}>
      {props.mobileView === "chat" ? <MobileChat {...props} /> : <MobileSettings {...props} />}
    </main>
  );
}
