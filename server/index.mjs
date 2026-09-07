import { HOST, PORT } from "./constants.mjs";
import { createApp } from "./app.mjs";

const port = Number(process.env.PORT || PORT);
const host = process.env.HOST || HOST;
const { app, ensureDataStore, waitForBackgroundTasks } = createApp();

await ensureDataStore();

const server = app.listen(port, host, () => {
  console.log(`Memory Agent API listening on http://${host}:${port}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Memory Agent API received ${signal}; shutting down.`);
  const forceExitTimer = setTimeout(() => {
    console.error("Memory Agent API shutdown timed out.");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref?.();
  server.close(async (error) => {
    try {
      await waitForBackgroundTasks();
    } catch (backgroundError) {
      console.error("Memory Agent API failed to flush background tasks", backgroundError);
      process.exitCode = 1;
    }
    if (error) {
      console.error("Memory Agent API failed to close", error);
      process.exitCode = 1;
    }
    clearTimeout(forceExitTimer);
  });
  server.closeIdleConnections?.();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

server.on("error", (error) => {
  console.error("Memory Agent API failed to start", error);
  process.exitCode = 1;
});
