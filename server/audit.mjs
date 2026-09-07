import fs from "node:fs/promises";
import path from "node:path";
import { createId } from "./ids.mjs";
import { sanitizeForLog } from "./logger.mjs";

const MAX_METADATA_CHARS = 4000;

export function createAuditWriter(auditDir) {
  let tail = Promise.resolve();

  return async function writeAuditEvent(event) {
    const operation = tail.catch(() => undefined).then(async () => {
      const normalized = normalizeAuditEvent(event);
      const filePath = path.join(auditDir, `${normalized.timestamp.slice(0, 10)}.ndjson`);
      await fs.mkdir(auditDir, { recursive: true, mode: 0o700 });
      await fs.appendFile(filePath, `${JSON.stringify(normalized)}\n`, { encoding: "utf8", mode: 0o600 });
      await fs.chmod(filePath, 0o600).catch(() => {});
      return normalized;
    });
    tail = operation.then(() => undefined, () => undefined);
    return await operation;
  };
}

export function normalizeAuditEvent(event, now = new Date().toISOString()) {
  const metadata = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const sanitizedMetadata = JSON.parse(sanitizeForLog(metadata));
  const serializedMetadata = JSON.stringify(sanitizedMetadata);
  return {
    id: String(event?.id || createId("audit")),
    timestamp: String(event?.timestamp || now),
    action: String(event?.action || "unknown").slice(0, 120),
    outcome: ["success", "failure", "pending", "cancelled"].includes(event?.outcome)
      ? event.outcome
      : "success",
    actor: String(event?.actor || "admin").slice(0, 120),
    resourceType: String(event?.resourceType || "system").slice(0, 80),
    resourceId: event?.resourceId ? String(event.resourceId).slice(0, 200) : undefined,
    metadata: serializedMetadata.length <= MAX_METADATA_CHARS
      ? sanitizedMetadata
      : { truncated: true }
  };
}
