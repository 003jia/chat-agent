import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAuditWriter, normalizeAuditEvent } from "./audit.mjs";

const tempRoots = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("audit log", () => {
  it("normalizes metadata and redacts secrets", () => {
    const event = normalizeAuditEvent({
      action: "tool.approved",
      outcome: "success",
      resourceType: "task",
      resourceId: "task-1",
      metadata: { apiKey: "sk-secret", toolId: "workspace.write" }
    }, "2026-08-13T00:00:00.000Z");

    expect(event.timestamp).toBe("2026-08-13T00:00:00.000Z");
    expect(event.metadata.apiKey).toBe("[REDACTED]");
    expect(event.metadata.toolId).toBe("workspace.write");
  });

  it("serializes concurrent events into a daily ndjson file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "memory-agent-audit-"));
    tempRoots.push(root);
    const writeAudit = createAuditWriter(root);
    await Promise.all([
      writeAudit({ action: "task.created", outcome: "pending", resourceId: "task-1" }),
      writeAudit({ action: "task.cancelled", outcome: "cancelled", resourceId: "task-1" })
    ]);

    const filePath = path.join(root, `${new Date().toISOString().slice(0, 10)}.ndjson`);
    const events = (await readFile(filePath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((event) => event.action)).toEqual(["task.created", "task.cancelled"]);
  });
});
