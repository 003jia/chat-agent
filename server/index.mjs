import { HOST, PORT } from "./constants.mjs";
import { createApp } from "./app.mjs";

const port = Number(process.env.PORT || PORT);
const host = process.env.HOST || HOST;
const { app, ensureDataStore } = createApp();

await ensureDataStore();

const server = app.listen(port, host, () => {
  console.log(`Memory Agent API listening on http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error("Memory Agent API failed to start", error);
  process.exitCode = 1;
});
