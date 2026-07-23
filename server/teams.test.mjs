import { describe, expect, it } from "vitest";
import { normalizeTeamStore } from "./teams.mjs";

const roles = [{ id: "role-a" }, { id: "role-b" }];

describe("normalizeTeamStore", () => {
  it("filters missing roles and keeps the lead inside the member list", () => {
    const store = normalizeTeamStore({
      selectedTeamId: "team-a",
      teams: [{
        id: "team-a",
        name: "研发团",
        memberRoleIds: ["role-a", "missing", "role-a"],
        leadRoleId: "missing"
      }]
    }, roles);

    expect(store.teams[0].memberRoleIds).toEqual(["role-a"]);
    expect(store.teams[0].leadRoleId).toBe("role-a");
  });

  it("clears the selection when no teams remain", () => {
    expect(normalizeTeamStore({ selectedTeamId: "missing", teams: [] }, roles)).toEqual({
      selectedTeamId: null,
      teams: []
    });
  });
});
