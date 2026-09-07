// [Sync Meta]
// module: auth
// doc_refs: ["docs/api/auth-health.md"]
// synced_commit: 3f06b8ba
// [/Sync Meta]

import { describe, expect, it } from "vitest";
import { ADMIN_PASSWORD_DEFAULT, ADMIN_USERNAME_DEFAULT, verifyAdminCredentials } from "./auth.mjs";

describe("verifyAdminCredentials", () => {
  it("accepts the default admin credentials when no env overrides are set", () => {
    expect(verifyAdminCredentials({ username: ADMIN_USERNAME_DEFAULT, password: ADMIN_PASSWORD_DEFAULT }, {})).toBe(true);
    expect(verifyAdminCredentials({ username: "admin", password: "admin123" }, {})).toBe(true);
  });

  it("rejects wrong username, wrong password, or empty credentials", () => {
    expect(verifyAdminCredentials({ username: "admin", password: "wrong" }, {})).toBe(false);
    expect(verifyAdminCredentials({ username: "root", password: "admin123" }, {})).toBe(false);
    expect(verifyAdminCredentials({}, {})).toBe(false);
    expect(verifyAdminCredentials({ username: "admin" }, {})).toBe(false);
  });

  it("honors MEMORY_AGENT_ADMIN_USERNAME / MEMORY_AGENT_ADMIN_PASSWORD env overrides", () => {
    const env = { MEMORY_AGENT_ADMIN_USERNAME: "owner", MEMORY_AGENT_ADMIN_PASSWORD: "p@ss" };
    expect(verifyAdminCredentials({ username: "owner", password: "p@ss" }, env)).toBe(true);
    expect(verifyAdminCredentials({ username: "admin", password: "admin123" }, env)).toBe(false);
  });

  it("rejects non-string username or password values", () => {
    expect(verifyAdminCredentials({ username: 123, password: "admin123" }, {})).toBe(false);
    expect(verifyAdminCredentials({ username: "admin", password: null }, {})).toBe(false);
  });
});
