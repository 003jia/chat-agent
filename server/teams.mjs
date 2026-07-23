export const emptyTeamStore = {
  selectedTeamId: null,
  teams: []
};

export function normalizeTeamStore(store, roles = []) {
  const roleIds = new Set(roles.map((role) => role.id));
  const teams = Array.isArray(store?.teams)
    ? store.teams
      .filter((team) => team && team.id)
      .map((team) => {
        const memberRoleIds = Array.from(new Set(
          (Array.isArray(team.memberRoleIds) ? team.memberRoleIds : [])
            .map(String)
            .filter((roleId) => roleIds.has(roleId))
        ));
        const leadRoleId = memberRoleIds.includes(team.leadRoleId)
          ? team.leadRoleId
          : memberRoleIds[0] || null;
        return {
          id: String(team.id),
          name: String(team.name || "未命名专家团").trim().slice(0, 80) || "未命名专家团",
          goal: String(team.goal || "").trim().slice(0, 2000),
          enabled: team.enabled !== false,
          leadRoleId,
          memberRoleIds,
          createdAt: team.createdAt || new Date().toISOString(),
          updatedAt: team.updatedAt || team.createdAt || new Date().toISOString()
        };
      })
    : [];
  const selectedTeamId = teams.some((team) => team.id === store?.selectedTeamId)
    ? store.selectedTeamId
    : teams[0]?.id || null;
  return { selectedTeamId, teams };
}
