import { Loader2 } from "lucide-react";
import { InteractionPanel } from "./components/InteractionPanel";
import { DesktopWorkbench, MobileWorkbench } from "./components/Workbenches";
import { useWorkbenchState } from "./hooks/useWorkbenchState";

function App() {
  const state = useWorkbenchState();

  if (state.loading) {
    return (
      <main className="loading-screen">
        <Loader2 className="spin" size={24} />
        <span>正在加载 Memory Agent...</span>
      </main>
    );
  }

  return (
    <>
      <DesktopWorkbench {...state.props} />
      <MobileWorkbench {...state.props} mobileView={state.mobileView} />
      <InteractionPanel {...state.props} />
    </>
  );
}

export default App;
