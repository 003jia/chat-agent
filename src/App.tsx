import { FormEvent, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { InteractionPanel } from "./components/InteractionPanel";
import { DesktopWorkbench, MobileWorkbench } from "./components/Workbenches";
import { useWorkbenchState } from "./hooks/useWorkbenchState";
import { api } from "./api";

function AccessSetup({
  updateAdminToken,
  retryBoot
}: {
  updateAdminToken: (value: string) => void;
  retryBoot: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setLoginError("");
    try {
      const result = await api.login(username.trim(), password);
      updateAdminToken(result.token);
    } catch (loginErr) {
      setLoginError(loginErr instanceof Error ? loginErr.message : "登录失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-setup">
      <form className="access-setup-panel" onSubmit={submit}>
        <span className="access-setup-icon"><KeyRound size={24} /></span>
        <div>
          <p className="eyebrow">本地服务访问</p>
          <h1>登录 Memory Agent</h1>
          <p className="access-setup-copy">
            使用管理员账号登录。登录状态只保存在当前浏览器会话中。
          </p>
        </div>
        <label>
          账号
          <input
            type="text"
            value={username}
            placeholder="请输入账号"
            autoComplete="username"
            autoFocus
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            placeholder="请输入密码"
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {/* 初始不显示服务端校验错误，仅在登录失败时提示 */}
        {loginError ? <p className="access-setup-error" role="alert">{loginError}</p> : null}
        <div className="access-setup-actions">
          <button type="submit" className="primary-button" disabled={!username.trim() || !password || busy}>
            {busy ? <Loader2 className="spin" size={16} /> : null}
            登录并进入
          </button>
          <button type="button" className="icon-text-button" onClick={retryBoot}>
            <RefreshCw size={16} />
            重试
          </button>
        </div>
        <p className="access-setup-hint">
          默认账号 <code>admin</code>，密码可通过服务端环境变量 <code>MEMORY_AGENT_ADMIN_PASSWORD</code> 配置。
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
