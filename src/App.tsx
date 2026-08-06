import { FormEvent, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { InteractionPanel } from "./components/InteractionPanel";
import { DesktopWorkbench, MobileWorkbench } from "./components/Workbenches";
import { useWorkbenchState } from "./hooks/useWorkbenchState";

function AccessSetup({
  adminToken,
  error,
  updateAdminToken,
  retryBoot
}: {
  adminToken: string;
  error: string;
  updateAdminToken: (value: string) => void;
  retryBoot: () => void;
}) {
  const [draft, setDraft] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    updateAdminToken(draft);
    setDraft("");
  }

  return (
    <main className="access-setup">
      <form className="access-setup-panel" onSubmit={submit}>
        <span className="access-setup-icon"><KeyRound size={24} /></span>
        <div>
          <p className="eyebrow">本地服务访问</p>
          <h1>连接 Memory Agent</h1>
          <p className="access-setup-copy">
            输入服务端配置的管理令牌。令牌只保存在当前浏览器会话中，不会写入项目文件。
          </p>
        </div>
        <label>
          X-Admin-Token
          <input
            type="password"
            value={draft}
            placeholder={adminToken ? "当前会话已保存令牌，可重新输入覆盖" : "输入管理令牌"}
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        {error ? <p className="access-setup-error" role="alert">{error}</p> : null}
        <div className="access-setup-actions">
          <button type="submit" className="primary-button" disabled={!draft.trim()}>
            保存并连接
          </button>
          <button type="button" className="icon-text-button" onClick={retryBoot}>
            <RefreshCw size={16} />
            重试
          </button>
        </div>
        <p className="access-setup-hint">
          服务端需设置 <code>MEMORY_AGENT_ADMIN_TOKEN</code>，浏览器令牌必须与其一致。
        </p>
      </form>
    </main>
  );
}

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

  if (state.setupRequired) {
    return (
      <AccessSetup
        adminToken={state.adminToken}
        error={state.error}
        updateAdminToken={state.updateAdminToken}
        retryBoot={state.retryBoot}
      />
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
