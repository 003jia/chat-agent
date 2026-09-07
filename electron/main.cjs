// Electron 主进程：Memory Agent 桌面版
// 生产模式：进程内启动 Express server（复用 server/app.mjs），同端口托管 dist，窗口加载 http://127.0.0.1:8787
// 开发模式：仅加载 ELECTRON_START_URL（vite dev），server 由 npm run dev:server 提供
const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const HOST = "127.0.0.1";
const PORT = 8787;
const DEV_URL = process.env.ELECTRON_START_URL || "";
const isDev = Boolean(DEV_URL);

// 显式指定用户数据目录（避免 Electron 默认解析异常），可用环境变量覆盖以便测试
const userDataDir = process.env.MEMORY_AGENT_USER_DATA || path.join(app.getPath("appData"), "Memory Agent");
app.setPath("userData", userDataDir);

// admin token：优先使用外部传入（开发模式固定值），生产模式随机生成
const adminToken = process.env.MEMORY_AGENT_ADMIN_TOKEN || crypto.randomBytes(24).toString("hex");

// 为所有请求注入 X-Admin-Token，前端无需手动配置 token
function injectAdminToken() {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["X-Admin-Token"] = adminToken;
    callback({ requestHeaders: details.requestHeaders });
  });
}

// 生产模式：进程内启动后端 server
async function startEmbeddedServer() {
  const { createApp } = await import(path.join(__dirname, "..", "server", "app.mjs"));
  const userData = app.getPath("userData");

  // 将前端构建产物复制到 userData/dist（幂等），createApp 会在该目录下托管前端并读取 data/
  // 来源优先级：打包资源（resources/dist）> 项目本地 dist（electron:start 未打包运行场景）
  const resourcesDist = path.join(process.resourcesPath, "dist");
  const localDist = path.join(__dirname, "..", "dist");
  const distSource = fs.existsSync(resourcesDist) ? resourcesDist : fs.existsSync(localDist) ? localDist : null;
  if (distSource) {
    fs.cpSync(distSource, path.join(userData, "dist"), { recursive: true });
  }

  process.env.MEMORY_AGENT_ADMIN_TOKEN = adminToken;
  const { app: serverApp, ensureDataStore } = createApp({ rootDir: userData });
  await ensureDataStore();
  await new Promise((resolve, reject) => {
    const server = serverApp.listen(PORT, HOST, resolve);
    server.on("error", reject);
  });
  console.log(`[electron] API listening on http://${HOST}:${PORT} (data: ${path.join(userData, "data")})`);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#eef4fb",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // 安全：禁止新窗口与外链导航
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_URL) : url.startsWith(`http://${HOST}:${PORT}`);
    if (!allowed) event.preventDefault();
  });

  const url = isDev ? DEV_URL : `http://${HOST}:${PORT}`;
  win.loadURL(url);
  return win;
}

app.whenReady().then(async () => {
  injectAdminToken();
  if (!isDev) {
    try {
      await startEmbeddedServer();
    } catch (error) {
      console.error("[electron] 内置服务启动失败:", error);
      app.quit();
      return;
    }
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
