import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanupAtomicFsTemps,
  writeJsonAtomic,
  writeTextAtomic
} from "./atomic-fs.mjs";

const TEMP_FILE_RE = /\.tmp-\d+-[0-9a-f\-]{36}$/i;

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-fs-test-"));
  return dir;
}

describe("atomic-fs", () => {
  it("writes and reads a JSON object atomically", async () => {
    const dir = await makeTempDir();
    try {
      const filePath = path.join(dir, "data.json");
      await writeJsonAtomic(filePath, { items: [1, 2, 3], ok: true });
      const raw = await fs.readFile(filePath, "utf8");
      expect(JSON.parse(raw)).toEqual({ items: [1, 2, 3], ok: true });
      // Pretty-printed + trailing newline
      expect(raw).toMatch(/^\{\n/);

      const listing = (await fs.readdir(dir)).filter((name) => name !== "data.json" && !/^\.DS_Store$/.test(name));
      expect(listing).toHaveLength(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("writes text atomically without leaving temp files", async () => {
    const dir = await makeTempDir();
    try {
      const filePath = path.join(dir, "notes.md");
      await writeTextAtomic(filePath, "# hello\n\nworld");
      const raw = await fs.readFile(filePath, "utf8");
      expect(raw).toBe("# hello\n\nworld");
      const temps = (await fs.readdir(dir)).filter((name) => TEMP_FILE_RE.test(name));
      expect(temps).toHaveLength(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("recovers from incomplete tmp files left by a previous crash", async () => {
    const dir = await makeTempDir();
    try {
      const nested = path.join(dir, "nested");
      await fs.mkdir(nested, { recursive: true });
      // Two files matching our own suffix format — should be pruned.
      const staleA = path.join(nested, "stale.json.tmp-12345-fedcba09-8765-4321-bcde-a98765432101");
      const staleB = path.join(dir, "orphan.txt.tmp-67890-fedcba09-8765-4321-bcde-a9876543210f");
      // A differently named user file that should remain untouched.
      const unrelatedFile = path.join(nested, "notes.txt.tmp-renamed-by-user");
      const realFile = path.join(dir, "keepme.json");

      await Promise.all([
        fs.writeFile(staleA, "trash", "utf8"),
        fs.writeFile(staleB, "trash", "utf8"),
        fs.writeFile(unrelatedFile, "keep me", "utf8"),
        writeJsonAtomic(realFile, { ok: true })
      ]);

      await cleanupAtomicFsTemps(dir);

      // Stale temps should be gone.
      expect((await fs.readdir(dir)).some((name) => name.includes("orphan.txt.tmp-"))).toBe(false);
      expect((await fs.readdir(nested)).some((name) => name.startsWith("stale.json.tmp-"))).toBe(false);
      // Unrelated and regular files must survive.
      expect(await fs.readFile(unrelatedFile, "utf8")).toBe("keep me");
      expect(JSON.parse(await fs.readFile(realFile, "utf8"))).toEqual({ ok: true });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
