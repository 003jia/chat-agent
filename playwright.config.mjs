// @ts-check
// Playwright E2E 配置：前端 vite(5173) + 隔离数据根后端(8787, scripts/e2e-server.mjs)
// 模块通过 --project=<module> 运行；统一由 scripts/run-and-archive.mjs 单入口驱动。
import { defineConfig } from "@playwright/test";

const E2E_ROOT = ".e2e-tmp";

export default defineConfig({
  testDir: "./e2e/specs",
  globalSetup: "./e2e/global-setup.mjs",
  // 单进程模式（Mac 受限会话必需）下浏览器无法跨用例复用：每个用例独占 worker
  fullyParallel: true,
  workers: 4,
  // 模块 = project 名；npm run test:e2e:<module> 透传 --project
  projects: [
    { name: "chat", testMatch: /chat\.spec\.ts/ },
    { name: "login", testMatch: /login\.spec\.ts/ },
    { name: "summary", testMatch: /summary\.spec\.ts/ }
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1024 },
    trace: "retain-on-failure",
    video: "on",
    screenshot: "on",
    // 复制用例依赖 navigator.clipboard.writeText，需显式授权
    permissions: ["clipboard-read", "clipboard-write"],
    // macOS 受限会话下 Mach 端口注册会被拒；单进程模式绕过该限制
    launchOptions: {
      args: ["--no-sandbox", "--single-process"]
    }
  },
  reporter: [
    ["list"],
    ["json", { outputFile: ".e2e-results/results.json" }],
    ["html", { outputFolder: "playwright-report", open: "never" }]
  ],
  outputDir: ".e2e-results/trace",
  // 前置服务：前端 + 隔离后端（数据根指向 .e2e-tmp，禁止触达真实 data/）
  webServer: [
    {
      command: "npm run dev:client",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: `node scripts/e2e-server.mjs`,
      url: "http://127.0.0.1:8787/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        ...process.env,
        PORT: "8787",
        MEMORY_AGENT_E2E_ROOT: E2E_ROOT,
        MEMORY_AGENT_ADMIN_TOKEN: "dev-token"
      }
    }
  ]
});
